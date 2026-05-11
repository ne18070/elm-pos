# Guide de Déploiement — Google Play Store

**App :** ELM Mobile  
**Package :** `com.elmapp.mobile`  
**Stack :** Next.js (export statique) + Capacitor 8

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 18+ |
| Java JDK | 17+ |
| Android Studio | Hedgehog (2023.1.1)+ |
| Capacitor CLI | 8.x |
| Compte Google Play Console | actif |

---

## 1. Préparer le build Next.js pour mobile

Le webDir est `renderer/out`. Next.js doit exporter en mode statique.

### 1.1 next.config.js — déjà configuré

`output: 'export'` et `trailingSlash: true` sont activés automatiquement
quand `ELECTRON_BUILD=1` est défini (ce que fait `mobile:build`). Aucune
modification manuelle n'est nécessaire.

### 1.2 Builder et synchroniser

```bash
yarn mobile:build
# équivaut à :
# cross-env ELECTRON_BUILD=1 yarn build:next && npx cap sync
```

> `cap sync` copie `renderer/out/` vers `android/app/src/main/assets/public/`
> et met à jour les plugins Capacitor.

---

## 2. Mettre à jour la version avant chaque release

Éditer `android/app/build.gradle` :

```gradle
defaultConfig {
    versionCode 2          // ← incrémenter à chaque publication
    versionName "1.1.0"   // ← version affichée sur le Play Store
}
```

> **Règle :** `versionCode` doit toujours être strictement supérieur au build précédent.

---

## 3. Générer le Keystore de signature (une seule fois)

```bash
keytool -genkeypair \
  -v \
  -keystore elm-release.jks \
  -alias elm-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Renseigner : nom, organisation, ville, pays → mot de passe fort.

**Conserver `elm-release.jks` et les mots de passe en lieu sûr.**  
Ne jamais committer ce fichier dans git.

```bash
# .gitignore
elm-release.jks
*.jks
keystore.properties
```

---

## 4. Configurer la signature dans Gradle

### 4.1 Créer `android/keystore.properties`

```properties
storeFile=../../elm-release.jks
storePassword=MOT_DE_PASSE_STORE
keyAlias=elm-key
keyPassword=MOT_DE_PASSE_CLE
```

### 4.2 Modifier `android/app/build.gradle`

```gradle
// En haut du fichier, avant android { }
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

android {
    ...
    signingConfigs {
        release {
            storeFile     file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias      keystoreProperties['keyAlias']
            keyPassword   keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## 5. Activer minifyEnabled (recommandé)

Pour réduire la taille de l'APK :

```gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        signingConfig signingConfigs.release
    }
}
```

---

## 6. Générer l'AAB (Android App Bundle)

Le Play Store exige le format **AAB** (et non APK) depuis août 2021.

### Via Android Studio

```
Build → Generate Signed Bundle / APK
→ Android App Bundle
→ Sélectionner elm-release.jks
→ Build Variant : release
→ Destination : android/app/release/
```

### Via ligne de commande

```bash
cd android
./gradlew bundleRelease
./gradlew.bat bundleRelease

```

Le fichier généré : `android/app/build/outputs/bundle/release/app-release.aab`

---

## 7. Tester l'AAB localement avant soumission

```bash
# Installer bundletool (https://github.com/google/bundletool)
java -jar bundletool.jar build-apks \
  --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  --output=elm.apks \
  --ks=elm-release.jks \
  --ks-key-alias=elm-key

java -jar bundletool.jar install-apks --apks=elm.apks
```

---

## 8. Assets obligatoires pour le Play Store

| Asset | Dimensions | Format |
|---|---|---|
| Icône app | 512 × 512 px | PNG (sans transparence) |
| Feature graphic | 1024 × 500 px | PNG ou JPEG |
| Screenshots téléphone | min 2, max 8 | PNG/JPEG (16:9 ou 9:16) |
| Screenshots tablette (optionnel) | min 1 | PNG/JPEG |

### Générer l'icône Android

```bash
# Avec Android Studio :
# File → New → Image Asset
# Type : Launcher Icons (Adaptive & Legacy)
# Source : logo.png (1024×1024 recommandé)
```

---

## 9. Préparer la fiche Play Console

Se connecter sur [play.google.com/console](https://play.google.com/console)

### 9.1 Créer une nouvelle application

- Nom : **ELM Mobile**
- Langue par défaut : Français (France)
- Type : Application
- Catégorie : Business / Productivité

### 9.2 Remplir la fiche principale

```
Titre court     : ELM Mobile
Titre long      : ELM – Gestion PME & Caisse
Description courte (80 car.) :
  Caisse, stocks, livraisons et gestion d'équipe pour PME sénégalaises.

Description longue (4000 car.) :
  ELM Mobile est l'application de gestion tout-en-un pour les PME.
  Boutique, restaurant, location, prestation de service ou cabinet juridique —
  ELM s'adapte à votre activité.

  Fonctionnalités :
  • Tableau de bord temps réel (CA, commandes, stock)
  • Suivi des livraisons et livreurs
  • Gestion des contrats et véhicules (location)
  • Ordres de travail (prestation de service)
  • Dossiers juridiques et honoraires
  • Base clients avec appel direct
  • Compatible avec l'application desktop ELM
```

---

## 10. Politique de confidentialité (obligatoire)

Le Play Store exige une URL publique de politique de confidentialité.

Créer la page sur votre site ou utiliser `/privacy` de l'app web :
```
https://www.elm-app.click/privacy
```

---

## 11. Paramètres de contenu

Dans Play Console → Contenu de l'application :

- **Public cible :** 18+
- **Données collectées :** email, nom, données de ventes (déclarer dans la section Sécurité des données)
- **Chiffrement en transit :** Oui (HTTPS / Supabase)
- **Suppression des données :** Oui (depuis les paramètres de l'app)

### Sécurité des données — à déclarer

| Donnée | Collectée | But |
|---|---|---|
| Adresse e-mail | Oui | Authentification |
| Nom | Oui | Identification |
| Données financières (ventes) | Oui | Fonctionnement de l'app |
| Localisation | Non | — |

---

## 12. Première soumission

```
Play Console
→ Production (ou Test interne pour commencer)
→ Créer une release
→ Uploader app-release.aab
→ Notes de version : "Version initiale"
→ Enregistrer → Vérifier → Déployer
```

> Commencer par **Test interne** (réponse immédiate) puis **Production** (révision 1–3 jours).

---

## 13. Workflow de mise à jour (releases suivantes)

```bash
# 1. Incrémenter versionCode dans android/app/build.gradle
# 2. Builder
yarn mobile:build

# 3. Générer l'AAB
cd android && ./gradlew bundleRelease

# 4. Uploader sur Play Console → Production → Créer une release
```

---

## 14. Commandes de référence

```bash
# Build complet + sync Capacitor
yarn mobile:build

# Ouvrir Android Studio
yarn mobile:android

# Build AAB signé en ligne de commande
cd android && ./gradlew bundleRelease

# Build APK de debug (test local uniquement)
cd android && ./gradlew assembleDebug

# Nettoyer le build
cd android && ./gradlew clean
```

---

## Checklist avant soumission

- [ ] `versionCode` incrémenté dans `build.gradle`
- [ ] `yarn mobile:build` exécuté avec succès
- [ ] AAB généré et testé sur device physique
- [ ] Icône 512×512 uploadée
- [ ] Feature graphic 1024×500 uploadée
- [ ] Minimum 2 screenshots téléphone
- [ ] Description courte et longue remplies
- [ ] URL politique de confidentialité configurée
- [ ] Section "Sécurité des données" complétée
- [ ] Catégorie d'âge renseignée
- [ ] Release créée sur Play Console

---

*Keystore à sauvegarder impérativement : sans lui, impossible de publier des mises à jour.*
