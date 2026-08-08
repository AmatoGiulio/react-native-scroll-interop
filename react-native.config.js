// Autolinking descriptor for bare React Native apps (apps without the `expo` package).
//
// Expo apps do not use this file: they discover the module through `expo-module.config.json`
// and expo-modules-autolinking. Both paths compile the same `android/` Gradle project; only the
// view-binding layer differs (`MaterialToolbarPackage` here, `ExpoMaterialToolbarModule` there).
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.materialtoolbar.rn.MaterialToolbarPackage;',
        packageInstance: 'new MaterialToolbarPackage()',
      },
      ios: null,
    },
  },
};
