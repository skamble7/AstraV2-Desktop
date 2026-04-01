import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.astra.desktop',
  productName: 'Astra Desktop',
  asar: true,
  directories: {
    buildResources: 'resources',
    output: 'dist',
  },
  files: [
    'out/**/*',
    '!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}',
    '!.editorconfig',
    '!**/._*',
    '!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS}',
    '!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}',
    '!**/{.eslintrc.json,eslint.config.js,.prettierrc}',
    '!**/*.map',
  ],
  mac: {
    category: 'public.app-category.developer-tools',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Development',
  },
};

export default config;
