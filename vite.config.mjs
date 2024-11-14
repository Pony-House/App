import { defineConfig, loadEnv, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';

import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'url';

import fse from 'fs-extra';
import electron from 'vite-plugin-electron';
import pkg from './package.json';

// Insert utils
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate Sounds Folders
const soundsFolder = path.join(__dirname, './electron/main/notification/sounds');
if (!fs.existsSync(soundsFolder)) {
  fs.mkdirSync(soundsFolder);
}

fs.copyFileSync(path.join(__dirname, './public/sound/notification.ogg'), path.join(soundsFolder, './notification.ogg'));
fs.copyFileSync(path.join(__dirname, './public/sound/invite.ogg'), path.join(soundsFolder, './invite.ogg'));
fse.copySync(path.join(__dirname, './vendor/twemoji/assets'), path.join(__dirname, './public/img/twemoji'), { overwrite: true });

const getFilePath = (where) => normalizePath(path.resolve(__dirname, `./${where}`));

const copyFiles = {
  targets: [

    {
      src: getFilePath('node_modules/bootstrap-icons/icons/play-circle-fill.svg'),
      dest: 'img/svg/',
    },

    {
      src: getFilePath('node_modules/qrcode/lib/browser.js'),
      dest: 'js/qrcode/',
    },

    {
      src: getFilePath('node_modules/bootstrap/dist/js/bootstrap.bundle.min.js'),
      dest: 'js/',
    },

    {
      src: getFilePath('node_modules/bootstrap/dist/js/bootstrap.bundle.min.js.map'),
      dest: 'js/',
    },

    {
      src: getFilePath('node_modules/@matrix-org/olm/olm.wasm'),
      dest: '',
    },

    {
      src: getFilePath('README.md'),
      dest: '',
    },

    {
      src: getFilePath('src/util/pwa/service-worker.js'),
      dest: '',
    },

    {
      src: getFilePath('node_modules/jsstore/dist/jsstore.worker.min.js'),
      dest: '',
    },

    {
      src: getFilePath('node_modules/jsstore/dist/jsstore.worker.min.js.map'),
      dest: '',
    },

  ],
}

export default defineConfig(({ command, mode }) => {

  fs.rmSync('dist-electron', { recursive: true, force: true });

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG;

  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  console.log(`[vite-config] ${mode}`);
  console.log(`[vite-config] [command] ${command}`);

  console.log(`[vite-config] [is-build] ${isBuild}`);
  console.log(`[vite-config] [source-map] ${sourcemap}`);

  const env = loadEnv(mode, process.cwd(), '');
  const electronMode = (String(env.ELECTRON_MODE) === 'true' || process?.versions.electron);
  console.log(`[vite-config] [electron] ${electronMode}`);
  const addBooleanToEnv = (valueName) =>
    !!(env[valueName] === true || env[valueName] === 'true');
  const forceDevMode = addBooleanToEnv('FORCE_DEV_MODE');

  const envData = {

    MODE: !forceDevMode ? mode : 'development',
    COMMAND: command,
    ELECTRON_MODE: electronMode,
    VERSION: pkg.version,
    DEPS: pkg.dependencies,
    PLATFORM: process.platform,
    CUSTOM_DNS: {

      ENABLED: addBooleanToEnv('CUSTOM_DNS'),
      PORT: Number(env.CUSTOM_DNS_PORT),

      BLOCKCHAIN: {

        ud: {
          polygon: env.UD_POLYGON_DNS,
        },

        ens: env.ETHEREUM_DNS,

      },

    },

    INFO: {
      name: String(pkg.short_name),
      description: pkg.description,
      keywords: pkg.keywords,
      author: pkg.author,
      license: pkg.license,
      welcome: String(env.APP_WELCOME)
    },

    CONSOLE: {
      OPEN_WARNING: [
        `%cThis is a developer console! Putting weird things can result in theft of accounts or crashing your machine! Do not trust strange people asking you to paste things here!\n\nIf you are sending an error report to some developer, make sure that you are sending the data in a private chat. This data can be used to track which rooms/spaces/users you are interacting with.\n\n\nIf you are using crypto/web3 in your client, READ THIS WARNING 10000x BEFORE YOU'RE DOING SILLY STUFF HERE! YOU'RE RESPONSIBLE FOR YOUR OWN CUSTODY WALLET!`,
        'color:red; font-size: 12pt; font-weight: 700;',
      ]
    },

    SHARE_URL: typeof env.SHARE_URL === 'string' && env.SHARE_URL.length > 0 ? env.SHARE_URL : null,
    SHARE_URL_IS_PARAM: addBooleanToEnv('SHARE_URL_IS_PARAM'),
    SHARE_URL_FULL_HASHTAG: addBooleanToEnv('SHARE_URL_FULL_HASHTAG'),

    SIMPLER_HASHTAG_SAME_HOMESERVER: addBooleanToEnv('SIMPLER_HASHTAG_SAME_HOMESERVER'),
    FORCE_SIMPLER_SAME_HASHTAG: addBooleanToEnv('FORCE_SIMPLER_SAME_HASHTAG'),

    WEB3: addBooleanToEnv('WEB3'),
    IPFS: addBooleanToEnv('IPFS'),

    PAG_LIMIT: Number(env.PAG_LIMIT),

    SAVE_ROOM_DB: addBooleanToEnv('SAVE_ROOM_DB'),
    DISCORD_STYLE: addBooleanToEnv('DISCORD_STYLE'),
    SHOW_STICKERS: addBooleanToEnv('SHOW_STICKERS'),
    USE_CUSTOM_EMOJIS: addBooleanToEnv('USE_CUSTOM_EMOJIS'),
    USE_ANIM_PARAMS: addBooleanToEnv('USE_ANIM_PARAMS'),
    USE_FREEZE_PLUGIN: addBooleanToEnv('USE_FREEZE_PLUGIN'),

    DEV_TOOLS_TRAY: addBooleanToEnv('DEV_TOOLS_TRAY'),

    PEOPLE_DRAWER_HIDDEN: addBooleanToEnv('PEOPLE_DRAWER_HIDDEN'),
    NAVIGATION_SIDEBAR_HIDDEN: addBooleanToEnv('NAVIGATION_SIDEBAR_HIDDEN'),

    RUST_CRYPTO_MODE: addBooleanToEnv('RUST_CRYPTO_MODE'),

    EMBED_PARALLEL_LOAD: addBooleanToEnv('EMBED_PARALLEL_LOAD'),

    AUTO_ENCRYPT_CREATE_DM: addBooleanToEnv('AUTO_ENCRYPT_CREATE_DM'),
    DISABLE_ENCRYPT_SETTINGS: addBooleanToEnv('DISABLE_ENCRYPT_SETTINGS'),

    HOVER_SIDEBAR: addBooleanToEnv('HOVER_SIDEBAR'),
    SIDEBAR_TRANSITION: addBooleanToEnv('SIDEBAR_TRANSITION'),

    GUEST_ACCOUNT: addBooleanToEnv('GUEST_ACCOUNT'),

    TIMELINE_TIMEOUT: Number(env.TIMELINE_TIMEOUT),
    TIMELINE_TIMEOUT_MULTI: Number(env.TIMELINE_TIMEOUT_MULTI),
    TIMELINE_EVENTS_PER_TIME: Number(env.TIMELINE_EVENTS_PER_TIME),

    MAX_LISTENERS: Number(env.MAX_LISTENERS),
    MXC_FETCH_WAITER: Number(env.MXC_FETCH_WAITER),
    MXC_AUTHENTICATED_MEDIA: addBooleanToEnv('MXC_AUTHENTICATED_MEDIA'),
    MXC_SERVICE_WORKER: addBooleanToEnv('MXC_SERVICE_WORKER'),

    MXC_FETCH_TIMEOUT: {
      DEFAULT: Number(env.MXC_FETCH_TIMEOUT),
      EMOJI: Number(env.MXC_FETCH_TIMEOUT_EMOJI),
      AVATAR: Number(env.MXC_FETCH_TIMEOUT_AVATAR),
      MEDIA: Number(env.MXC_FETCH_TIMEOUT_MEDIA),
      ATTACH: Number(env.MXC_FETCH_TIMEOUT_ATTACH),
    },

    MXC_FETCH_LIMIT: {
      DEFAULT: Number(env.MXC_FETCH_LIMIT),
      EMOJI: Number(env.MXC_FETCH_LIMIT_EMOJI),
      AVATAR: Number(env.MXC_FETCH_LIMIT_AVATAR),
      MEDIA: Number(env.MXC_FETCH_LIMIT_MEDIA),
      ATTACH: Number(env.MXC_FETCH_LIMIT_ATTACH),
    },

    IMG: {
      SIZE: {
        AVATAR: Number(env.DEFAULT_AVATAR_SIZE)
      },
      SHOW_ERROR: addBooleanToEnv('SHOW_IMG_ERROR'),
    },

    LIBRE_TRANSLATE: {
      DEFAULT_HOST: typeof env.LIBRE_TRANSLATE_DEFAULT_HOST === 'string' && env.LIBRE_TRANSLATE_DEFAULT_HOST.length > 0 ?
        env.LIBRE_TRANSLATE_DEFAULT_HOST : '',
      API_KEY: typeof env.LIBRE_TRANSLATE_API_KEY === 'string' && env.LIBRE_TRANSLATE_API_KEY.length > 0 ?
        env.LIBRE_TRANSLATE_API_KEY : '',
      ENABLED: addBooleanToEnv('LIBRE_TRANSLATE_ENABLED'),
      VISIBLE: addBooleanToEnv('LIBRE_TRANSLATE_VISIBLE'),
    },

    EMOJIBOARD: {
      ROW_LIMIT: {

        EMOJI: {
          FAV: Number(env.FAV_EMOJI_ROWS_LIMIT),
          RECENT: Number(env.RECENT_EMOJI_ROWS_LIMIT),
        },

        STICKER: {
          FAV: Number(env.FAV_STICKER_ROWS_LIMIT),
          RECENT: Number(env.RECENT_STICKER_ROWS_LIMIT),
        }

      }
    },

    ACCOUNT_MANAGER: {
      SUPPORT: {
        PHONE_NUMBER: addBooleanToEnv('PHONE_NUMBER_SUPPORT'),
        EMAIL_ADDRESS: addBooleanToEnv('EMAIL_ADDRESS_SUPPORT'),
        DEACTIVATE_ACCOUNT: addBooleanToEnv('DEACTIVATE_ACCOUNT_SUPPORT'),
        ERASE_ACCOUNT: addBooleanToEnv('ERASE_ACCOUNT_SUPPORT'),
        OTHER_AUTH_LIST: addBooleanToEnv('OTHER_AUTH_LIST_SUPPORT'),
      }
    },

    LOGIN: {
      DEFAULT_HOMESERVER: Number(env.DEFAULT_HOMESERVER),
      ALLOW_CUSTOM_HOMESERVERS: addBooleanToEnv('ALLOW_CUSTOM_HOMESERVERS'),
      HOMESERVER_LIST: [],
    },

  };

  let HOMESERVER_LIST = 0;
  while (typeof env[`HOMESERVER_LIST${HOMESERVER_LIST}`] === 'string') {
    envData.LOGIN.HOMESERVER_LIST.push(env[`HOMESERVER_LIST${HOMESERVER_LIST}`]);
    HOMESERVER_LIST++;
  }

  // Result object
  const result = {

    publicDir: true,

    define: {
      __ENV_APP__: Object.freeze(envData),
    },

    server: {
      hmr: {
        overlay: true,
      },
      watch: {
        ignored: [
          "/android/**",
          "**/vendor/**",
          '**/release/**',
          '**/.flatpak/**',
          '**/.github/**',
          '**/.git/**',
          '**/.vscode/**',
        ],
      },
      port: 8469,
      host: true,
    },

    plugins: [
      viteStaticCopy(copyFiles),
      wasm(),
      react(),
    ],

    optimizeDeps: {
      exclude: ['rust-crypto', 'vite'],
      esbuildOptions: {

        define: {
          global: 'globalThis'
        },

        plugins: [
          // Enable esbuild polyfill plugins
          NodeGlobalsPolyfillPlugin({
            process: false,
            buffer: true,
          }),
        ]

      }
    },

    resolve: { alias: {}, },

  };

  result.resolve.alias['@src'] = path.join(__dirname, 'src');
  result.resolve.alias['@mods'] = path.join(__dirname, 'mods');

  const rollupOptions = {
    plugins: [
      inject({ Buffer: ['buffer', 'Buffer'] })
    ],
  };

  // Electron Mode
  if (electronMode) {

    // Extensions
    const extensions = [

      // Frame Wallet
      // { dist: path.join(__dirname, './electron/extensions/frame/dist'), path: 'frame' }

    ];

    for (const item in extensions) {
      fse.copySync(extensions[item].dist, path.join(__dirname, `./dist-electron/extensions/${extensions[item].path}`), { overwrite: true });
    }

    result.clearScreen = false;
    rollupOptions.external = Object.keys('dependencies' in pkg ? pkg.dependencies : {});

    result.plugins.push(electron([

      {

        // Main-Process entry file of the Electron App.
        entry: 'electron/main/index.ts',

        onstart(options) {
          if (process.env.VSCODE_DEBUG) {
            console.log(/* For `.vscode/.debug.script.mjs` */'[startup] [vscode] Debug electron app')
          } else {
            options.startup()
          }
        },

        vite: {
          define: result.define,
          resolve: result.resolve,
          build: {
            sourcemap,
            minify: isBuild,
            outDir: 'dist-electron/main',
            rollupOptions,
          },
        },

      },

      {

        entry: 'electron/preload/index.ts',

        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
          // instead of restarting the entire Electron App.
          options.reload()
        },

        vite: {
          define: result.define,
          resolve: result.resolve,
          build: {
            sourcemap: sourcemap ? 'inline' : undefined, // #332
            minify: isBuild,
            outDir: 'dist-electron/preload',
            rollupOptions,
          },
        },

      }

    ]));

  }

  // Normal
  else {

    result.appType = 'spa';
    result.base = '';

    result.build = {
      outDir: 'dist',
      sourcemap: true,
      copyPublicDir: true,
      rollupOptions
    };

  }

  // Complete
  return result;

});
