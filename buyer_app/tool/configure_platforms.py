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
    manifest.write_text(xml, encoding='utf-8')
    print(f'android: applicationId={APP_ID}, label={APP_NAME}, signature release, INTERNET')


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
    with info_path.open('wb') as f:
        plistlib.dump(info, f)
    print(f'ios: bundle={APP_ID}, CFBundleDisplayName={APP_NAME}, ITSAppUsesNonExemptEncryption=false')


if __name__ == '__main__':
    targets = sys.argv[1:] or ['android', 'ios']
    if 'android' in targets:
        configure_android()
    if 'ios' in targets:
        configure_ios()
