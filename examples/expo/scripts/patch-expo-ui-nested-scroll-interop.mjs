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
if (source.includes('EXPO_UI_INTEROP modifier-attached')) {
  console.log('[expo-ui-poc] traced nestedScrollInterop modifier already patched');
  process.exit(0);
}

const ensureImport = (line, marker) => {
  if (source.includes(`${line}\n`)) return;
  if (!source.includes(marker)) {
    throw new Error(`[expo-ui-poc] import marker changed while adding ${line}`);
  }
  source = source.replace(marker, `${line}\n${marker}`);
};

ensureImport('import android.util.Log', 'import androidx.compose.animation.animateColorAsState\n');
ensureImport('import androidx.compose.runtime.remember', 'import androidx.compose.runtime.getValue\n');
ensureImport('import androidx.compose.ui.geometry.Offset', 'import androidx.compose.ui.Modifier\n');
ensureImport(
  'import androidx.compose.ui.input.nestedscroll.NestedScrollConnection',
  'import androidx.compose.ui.layout.onGloballyPositioned\n'
);
ensureImport(
  'import androidx.compose.ui.input.nestedscroll.NestedScrollSource',
  'import androidx.compose.ui.layout.onGloballyPositioned\n'
);
ensureImport(
  'import androidx.compose.ui.input.nestedscroll.nestedScroll',
  'import androidx.compose.ui.layout.onGloballyPositioned\n'
);
ensureImport(
  'import androidx.compose.ui.platform.rememberNestedScrollInteropConnection',
  'import androidx.compose.ui.semantics.Role\n'
);
ensureImport('import androidx.compose.ui.unit.Velocity', 'import androidx.compose.ui.unit.DpOffset\n');

const oldRegistration =
  '    // Bridge Compose scrollables to a cooperating Android NestedScrollingParent3.\n' +
  '    register("nestedScrollInterop") { _, _, _, _ ->\n' +
  '      Modifier.nestedScroll(rememberNestedScrollInteropConnection())\n' +
  '    }\n\n';
if (source.includes(oldRegistration)) {
  source = source.replace(oldRegistration, '');
}

const registryMarker = '  private fun registerBuiltInModifiers() {\n    // Padding modifiers\n';
if (!source.includes(registryMarker)) {
  throw new Error('[expo-ui-poc] SDK 57 ModifierRegistry registration marker changed');
}

const tracedRegistration =
  '  private fun registerBuiltInModifiers() {\n' +
  '    // POC: bridge Compose scrollables to a cooperating Android NestedScrollingParent3.\n' +
  '    register("nestedScrollInterop") { _, _, _, _ ->\n' +
  '      val interop = rememberNestedScrollInteropConnection()\n' +
  '      val tracedInterop = remember(interop) {\n' +
  '        object : NestedScrollConnection {\n' +
  '          override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {\n' +
  '            Log.d("ReactNativeScrollInterop", "EXPO_UI_INTEROP pre availableY=${available.y} source=$source")\n' +
  '            return interop.onPreScroll(available, source)\n' +
  '          }\n\n' +
  '          override fun onPostScroll(\n' +
  '            consumed: Offset,\n' +
  '            available: Offset,\n' +
  '            source: NestedScrollSource\n' +
  '          ): Offset {\n' +
  '            Log.d("ReactNativeScrollInterop", "EXPO_UI_INTEROP post consumedY=${consumed.y} availableY=${available.y} source=$source")\n' +
  '            return interop.onPostScroll(consumed, available, source)\n' +
  '          }\n\n' +
  '          override suspend fun onPreFling(available: Velocity): Velocity {\n' +
  '            Log.d("ReactNativeScrollInterop", "EXPO_UI_INTEROP preFling y=${available.y}")\n' +
  '            return interop.onPreFling(available)\n' +
  '          }\n\n' +
  '          override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {\n' +
  '            Log.d("ReactNativeScrollInterop", "EXPO_UI_INTEROP postFling consumedY=${consumed.y} availableY=${available.y}")\n' +
  '            return interop.onPostFling(consumed, available)\n' +
  '          }\n' +
  '        }\n' +
  '      }\n' +
  '      Log.d("ReactNativeScrollInterop", "EXPO_UI_INTEROP modifier-attached")\n' +
  '      Modifier.nestedScroll(tracedInterop)\n' +
  '    }\n\n' +
  '    // Padding modifiers\n';

source = source.replace(registryMarker, tracedRegistration);

fs.writeFileSync(target, source);
console.log(`[expo-ui-poc] patched traced interop at ${path.relative(exampleRoot, target)}`);
