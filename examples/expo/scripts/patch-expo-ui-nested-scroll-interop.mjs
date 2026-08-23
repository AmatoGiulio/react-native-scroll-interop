import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, '..');
const candidates = [
  path.join(
    exampleRoot,
    'node_modules',
    '@expo',
    'ui',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'ui',
    'ModifierRegistry.kt'
  ),
  path.join(
    exampleRoot,
    'node_modules',
    'expo-router',
    'node_modules',
    '@expo',
    'ui',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'ui',
    'ModifierRegistry.kt'
  ),
];

const target = candidates.find((candidate) => fs.existsSync(candidate));
if (!target) {
  throw new Error(
    'Expo UI ModifierRegistry.kt was not found. Install examples/expo dependencies before running this POC.'
  );
}

let source = fs.readFileSync(target, 'utf8');
if (source.includes('register("nestedScrollInterop")')) {
  console.log('[expo-ui-poc] nestedScrollInterop modifier already patched');
  process.exit(0);
}

const importMarker = 'import androidx.compose.ui.platform.LocalDensity\n';
if (!source.includes(importMarker)) {
  throw new Error('[expo-ui-poc] SDK 57 ModifierRegistry import marker changed');
}
source = source.replace(
  importMarker,
  'import androidx.compose.ui.input.nestedscroll.nestedScroll\n' +
    importMarker +
    'import androidx.compose.ui.platform.rememberNestedScrollInteropConnection\n'
);

const registryMarker = '  private fun registerBuiltInModifiers() {\n    // Padding modifiers\n';
if (!source.includes(registryMarker)) {
  throw new Error('[expo-ui-poc] SDK 57 ModifierRegistry registration marker changed');
}
source = source.replace(
  registryMarker,
  '  private fun registerBuiltInModifiers() {\n' +
    '    // Bridge Compose scrollables to a cooperating Android NestedScrollingParent3.\n' +
    '    register("nestedScrollInterop") { _, _, _, _ ->\n' +
    '      Modifier.nestedScroll(rememberNestedScrollInteropConnection())\n' +
    '    }\n\n' +
    '    // Padding modifiers\n'
);

fs.writeFileSync(target, source);
console.log(`[expo-ui-poc] patched ${path.relative(exampleRoot, target)}`);
