#!/usr/bin/env python3
"""Configure les projets natifs générés par `flutter create` pour la publication.

Usage (depuis buyer_app/, après flutter create) :
    flutter create --org com.elmapp --project-name elm_boutique --platforms android,ios .
    python3 tool/configure_platforms.py

Idempotent : peut être relancé sur des dossiers déjà configurés (ou commités).
Échoue bruyamment si le template Flutter a changé, plutôt que de publier une app mal configurée.
"""
import plistlib
import re
import sys
from pathlib import Path

APP_ID = 'com.elmapp.mobile'          # identifiant existant sur Play Store / App Store
APP_NAME = 'ELM Boutique'

# Liens profonds (Universal Links / App Links) — garder aligné avec renderer/lib/mobile-app.ts
LINK_HOSTS = ['www.elm-app.click', 'elm-app.click']
LINK_PATH_PREFIXES = ['/boutique/', '/services/']

ROOT = Path(__file__).resolve().parent.parent


def fail(message: str) -> None:
    sys.exit(f'configure_platforms: {message}')


def configure_android() -> None:
    gradle = ROOT / 'android' / 'app' / 'build.gradle.kts'
    if not gradle.exists():
        fail(f'{gradle} introuvable (template Groovy ? lancer flutter create avec un Flutter récent)')
    src = gradle.read_text(encoding='utf-8')

    src, n = re.subn(r'applicationId = "[^"]*"', f'applicationId = "{APP_ID}"', src)
    if n != 1:
        fail('applicationId introuvable dans build.gradle.kts')

    if '// elm: release signing' not in src:
        src = (
            '// elm: release signing — android/key.properties est écrit par la CI\n'
            'import java.io.FileInputStream\n'
            'import java.util.Properties\n\n'
            + src
        )
        src = src.replace(
            'android {',
            'val keystoreProperties = Properties()\n'
            'val keystorePropertiesFile = rootProject.file("key.properties")\n'
            'if (keystorePropertiesFile.exists()) {\n'
            '    keystoreProperties.load(FileInputStream(keystorePropertiesFile))\n'
            '}\n\n'
            'android {',
            1,
        )
        signing_block = (
            '    signingConfigs {\n'
            '        create("release") {\n'
            '            if (keystorePropertiesFile.exists()) {\n'
            '                keyAlias = keystoreProperties["keyAlias"] as String\n'
            '                keyPassword = keystoreProperties["keyPassword"] as String\n'
            '                storeFile = file(keystoreProperties["storeFile"] as String)\n'
            '                storePassword = keystoreProperties["storePassword"] as String\n'
            '            }\n'
            '        }\n'
            '    }\n\n'
            '    buildTypes {'
        )
        if '    buildTypes {' not in src:
            fail('bloc buildTypes introuvable dans build.gradle.kts')
        src = src.replace('    buildTypes {', signing_block, 1)
        debug_signing = 'signingConfig = signingConfigs.getByName("debug")'
        if debug_signing not in src:
            fail('signingConfig debug introuvable dans le buildType release')
        src = src.replace(
            debug_signing,
            'signingConfig = if (keystorePropertiesFile.exists()) '
            'signingConfigs.getByName("release") else signingConfigs.getByName("debug")',
            1,
        )
    gradle.write_text(src, encoding='utf-8')

    manifest = ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
    xml = manifest.read_text(encoding='utf-8')
    xml, n = re.subn(r'android:label="[^"]*"', f'android:label="{APP_NAME}"', xml, count=1)
    if n != 1:
        fail('android:label introuvable dans AndroidManifest.xml')
    # Le template ne déclare INTERNET que pour debug/profile : indispensable en release (Supabase)
    if 'android.permission.INTERNET' not in xml:
        xml = re.sub(
            r'(<manifest[^>]*>)',
            r'\1\n    <uses-permission android:name="android.permission.INTERNET"/>',
            xml,
            count=1,
        )
    # App Links vérifiés : /boutique et /services s'ouvrent dans l'app. Le deep linking
    # Flutter par défaut est coupé, c'est le plugin app_links qui reçoit les liens.
    if 'elm: app links' not in xml:
        lines = [
            # 1re ligne insérée à la place de </activity>, qui garde son indentation (8 espaces)
            '    <!-- elm: app links -->',
            '            <meta-data android:name="flutter_deeplinking_enabled" android:value="false"/>',
            '            <intent-filter android:autoVerify="true">',
            '                <action android:name="android.intent.action.VIEW"/>',
            '                <category android:name="android.intent.category.DEFAULT"/>',
            '                <category android:name="android.intent.category.BROWSABLE"/>',
        ]
        for host in LINK_HOSTS:
            for prefix in LINK_PATH_PREFIXES:
                lines.append(
                    f'                <data android:scheme="https" android:host="{host}" '
                    f'android:pathPrefix="{prefix}"/>'
                )
        lines.append('            </intent-filter>')
        if '</activity>' not in xml:
            fail('</activity> introuvable dans AndroidManifest.xml')
        xml = xml.replace('</activity>', '\n'.join(lines) + '\n        </activity>', 1)
    manifest.write_text(xml, encoding='utf-8')
    print(f'android: applicationId={APP_ID}, label={APP_NAME}, signature release, INTERNET, app links')


def configure_ios() -> None:
    pbxproj = ROOT / 'ios' / 'Runner.xcodeproj' / 'project.pbxproj'
    if not pbxproj.exists():
        fail(f'{pbxproj} introuvable')
    project = pbxproj.read_text(encoding='utf-8')
    # Runner (+ RunnerTests) : quel que soit l'identifiant dérivé de --org/--project-name
    project = re.sub(
        r'PRODUCT_BUNDLE_IDENTIFIER = com\.elmapp\.[A-Za-z0-9_]+((?:\.RunnerTests)?);',
        lambda m: f'PRODUCT_BUNDLE_IDENTIFIER = {APP_ID}{m.group(1)};',
        project,
    )
    if f'PRODUCT_BUNDLE_IDENTIFIER = {APP_ID};' not in project:
        fail('PRODUCT_BUNDLE_IDENTIFIER de Runner introuvable dans project.pbxproj')
    pbxproj.write_text(project, encoding='utf-8')

    info_path = ROOT / 'ios' / 'Runner' / 'Info.plist'
    with info_path.open('rb') as f:
        info = plistlib.load(f)
    info['CFBundleDisplayName'] = APP_NAME
    # HTTPS standard uniquement → exemption, évite la question de conformité à chaque build
    info['ITSAppUsesNonExemptEncryption'] = False
    # Liens reçus par le plugin app_links, pas par le routeur Flutter
    info['FlutterDeepLinkingEnabled'] = False
    with info_path.open('wb') as f:
        plistlib.dump(info, f)

    # Universal Links : nécessite la capability « Associated Domains » sur l'App ID
    # et un profil de provisioning régénéré après l'avoir activée.
    entitlements = ROOT / 'ios' / 'Runner' / 'Runner.entitlements'
    with entitlements.open('wb') as f:
        plistlib.dump(
            {'com.apple.developer.associated-domains': [f'applinks:{host}' for host in LINK_HOSTS]},
            f,
        )
    project = pbxproj.read_text(encoding='utf-8')
    if 'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;' not in project:
        # Configurations Debug / Release / Profile de la cible Runner (pas RunnerTests)
        project, n = re.subn(
            r'([ \t]*)(PRODUCT_BUNDLE_IDENTIFIER = ' + re.escape(APP_ID) + r';)',
            lambda m: f'{m.group(1)}CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;\n{m.group(1)}{m.group(2)}',
            project,
        )
        if n == 0:
            fail("impossible d'ajouter CODE_SIGN_ENTITLEMENTS à la cible Runner")
        pbxproj.write_text(project, encoding='utf-8')
    print(f'ios: bundle={APP_ID}, CFBundleDisplayName={APP_NAME}, ITSAppUsesNonExemptEncryption=false, '
          f'associated domains={LINK_HOSTS}')


if __name__ == '__main__':
    targets = sys.argv[1:] or ['android', 'ios']
    if 'android' in targets:
        configure_android()
    if 'ios' in targets:
        configure_ios()
