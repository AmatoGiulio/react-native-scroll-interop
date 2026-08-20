'use strict';

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.reactnativescroll.interop.reactnative.ReactNativeScrollInteropPackage;',
        packageInstance: 'new ReactNativeScrollInteropPackage()',
      },
    },
  },
};
