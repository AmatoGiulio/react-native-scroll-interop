'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const VECTOR_ICONS = {
  demo_ic_home: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:pathData="M10,20v-6h4v6h5v-8h3L12,3 2,12h3v8z" />
</vector>
`,
  demo_ic_details: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:pathData="M19,3H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V5c0,-1.1 -0.9,-2 -2,-2zM14,17H7v-2h7v2zM17,13H7v-2h10v2zM17,9H7V7h10v2z" />
</vector>
`,
  demo_ic_add: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:pathData="M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
</vector>
`,
  demo_ic_collections: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:pathData="M20,2H4c-1.1,0 -2,0.9 -2,2v12h2V4h16V2zM22,6H8c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V8c0,-1.1 -0.9,-2 -2,-2zM8,20V8h14v12H8zM17,11l-2.5,3.01L12,11l-3,4v3h12v-4l-4,-3z" />
</vector>
`,
  demo_ic_search: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:pathData="M9.5,3a6.5,6.5 0,1 0,3.98 11.64L18.85,20 20,18.85l-5.36,-5.37A6.5,6.5 0,0 0,9.5,3zM9.5,5a4.5,4.5 0,1 1,0,9a4.5,4.5 0,0 1,0,-9z" />
</vector>
`,
};

module.exports = function withDemoToolbarIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const drawableDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable'
      );

      fs.mkdirSync(drawableDirectory, { recursive: true });
      for (const [name, contents] of Object.entries(VECTOR_ICONS)) {
        fs.writeFileSync(path.join(drawableDirectory, `${name}.xml`), contents);
      }

      return modConfig;
    },
  ]);
};
