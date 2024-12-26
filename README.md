<center>

<img align="center" src="https://github.com/Pony-House/Client/blob/dev/gallery/krita/banner/readme.jpg?raw=true" height="380">

<br/>

<p>
    <a rel="me" href="https://equestria.social/@JasminDreasond"><img src="https://img.shields.io/badge/Equestria-Social-2b90d9.svg?style=for-the-badge" alt="Equestria Social" /></a>
    <a href="https://www.patreon.com/JasminDreasond"><img src="https://img.shields.io/badge/donate-patreon-F96854.svg?logo=patreon&style=for-the-badge" alt="Patreon" /></a>
    <a href="https://ud.me/jasmindreasond.x"><img src="https://img.shields.io/badge/-Wallet-ecf0f1?style=for-the-badge&logo=Ethereum&logoColor=black" alt="Wallet" /></a>
    <a href="https://ko-fi.com/jasmindreasond"><img src="https://img.shields.io/badge/donate-ko%20fi-29ABE0.svg?logo=ko-fi&style=for-the-badge" alt="Ko-Fi" /></a>
    <a href="https://x.com/JasminDreasond"><img src="https://img.shields.io/twitter/follow/JasminDreasond?color=00acee&style=for-the-badge&logo=x" alt="Twitter" /></a>
    <a href="https://aur.archlinux.org/packages/pony-house-bin"><img src="https://img.shields.io/aur/version/pony-house-bin?logo=archlinux&style=for-the-badge" alt="Arch Linux" /></a>
</p>

</center>

Last Beta Version: https://github.com/Pony-House/Client/tree/60421cd2baf5cfb2bfcde00affcaec9a93581010

<br/>

If you want to use the latest beta most stable version, use the beta 2:

https://github.com/Pony-House/Client/tree/1.6.0-beta-2-(closed)


# Pony House

A Matrix client, focused on being a completely customizable open source superapp with everything you need to be happy with your friends.

<img align="center" src="https://github.com/Pony-House/Client/blob/dev/docs/assets/preview-2.png?raw=true" height="380">

## Motivation
I am someone who is definitely tired of seeing censorship spread across the internet. As I write this message on May 01 2023, it has been one of the most difficult days to have privacy, especially in Brazil due to the current political scenario.

I see the Matrix project as one of the best alternatives to maintain at least try to keep communities and groups of friends on the internet. So my goal is to make this fork as good as possible so that not only can I be happy, but also all the people who are having a similar situation to me.

## Unofficial versions

Unofficial version is supported by the community. Any questions you have about these versions please contact the list of developers below. Links to download unofficial versions are present in the description at the top of the readme.

- Arch Linux - supported by Maki

## Getting started
Web app is available at https://client.pony.house/ and gets updated on each new release.

To host Pony House on your own, download the app from [GitHub release](https://github.com/Pony-House/Client/releases/latest).
You can serve the application with a webserver of your choice by simply copying `dist/` directory to the webroot. 
To set default Homeserver on login and register page, place a customized [`.env`](.env) in webroot of your choice.

If you want to use devtools in production mode in the desktop version before the application is opened, type `--devtools` after the file path.

## Supports

### Web3
The ethers.js is a crypto open source lib used for the client to have connection with your crypto wallet (if you have any installed on your machine).
This feature use is inspired by Telegram that allows you to use crypto as a payment method in the conversation between users. At the moment this API only supports the Ethereum Network (Example: Mainnet, Polygon, Optimism)
### IPFS
This feature gives you the freedom to configure which gateway you want to load the IPFS protocol links within the client. You can use any third-party node or an IPFS node self-host.

### LibreTranslate
This is an open source third-party project that allows you to use a translator hosted on your machine or on some third-party server without needing on some big tech. Pony House uses this API to give you the option to translate incoming messages.

Just like IPFS, you can use your own instance hosted on your machine, or some third-party server.

### Yjs
Yjs is a shared editing framework. It exposes Shared Types that can be manipulated like any other data type. But they are synced automatically using the room events.

### Tor (Or any other proxy)
Available only for desktop versions. You can natively configure a proxy to run within your client.

The configuration is available on the login screen, on the loading screen, and on the client's `Security` tab.

## Custom App Style
Would you like to customize your login page to your website? Then you can check out some values available in the `config/custom-css.scss` file.

Replace this value to change the appID: `pony-house-matrix`

Replace some values in the file: `electron-builder.json5`

App title in `electron/main/index.ts`.

If you would like to edit the version checker url, you can edit the `src/client/state/cons.js` file.

If you would like to edit the homeservers list, you can edit the `.env` file.

If you want to put a custom name or welcome message for the app, edit the .env file. (This will only affect the application within react.)

If you want to change some more information about the application's HTML, you'll be looking for the `index.html` file.

If you are trying to edit application image files, you are looking for the `public/img/` folder.

If you want to modify the manifest file, it is present in `public/manifest.json`.

Changelog manager: `src/versions.jsx` and `public/changelog` folder.

Things more related to the mobile version of the application I recommend you use the <a href="https://marketplace.visualstudio.com/items?itemName=ionic.ionic" target="_blank">Ionic extension</a> from Visual Studio Code.

## Auto select custom domain

Example: https://client.pony.house/#matrix.org

When the page loads, the application will automatically try to load the selected custom homeserver. This is useful if you want to refer a friend directly using your homeserver url.

## Mod and patch support
You can freely develop mods for users to install on the Pony House. The application will also support you to build a version of Pony House with pre-installed mods.

For more information see the folder `/mods`.

## Local development
> We recommend using a version manager as versions change very quickly. You will likely need to switch 
between multiple Node.js versions based on the needs of different projects you're working on. [NVM on windows](https://github.com/coreybutler/nvm-windows#installation--upgrades) on Windows and [nvm](https://github.com/nvm-sh/nvm) on Linux/macOS are pretty good choices. Also recommended nodejs version Hydrogen LTS (v18).

If you don't have nodejs, please install this:

https://nodejs.org/

If you don't have yarn and asar installed on your computer, it is recommended that you install it:
```sh
npm install yarn -g
npm install asar -g
```

Execute the following commands to start a development server (or a Ionic environment):
```sh
yarn # Installs all dependencies
yarn start # Serve a development version
```

To build the web app:
```sh
yarn build # Compiles the app into the dist/ directory
```

If the first option fails, please try this one:
```sh
yarn build:8gb # Compiles the app into the dist/ directory
```

### Electron (Desktop)
> While you're using the app's dev mode, it's normal for the app to show that it's disconnected for a few seconds before fully loading the page. Notifications may not mute OS sound in application dev mode. The same thing can happen for notification click events to fail only in dev mode.

The application has only been tested on the Linux and Windows platform. But that won't stop you from trying to deploy to Mac.

Execute the following commands to start a development server (or a Ionic environment):
```sh
yarn # Installs all dependencies
yarn electron:start # Serve a development version
```

To build the desktop app:
```sh
yarn electron:build # Compiles the app into the release/ directory
```

### Env file

Client performance settings are fully customizable! You can adapt the entire client to your personal way or your homeserver you are developing.

### AppData

If you need to manage client files on your desktop version. You can find specific storage files in the directory below:

    %AppData%/pony-house-matrix/tinyMatrixData/

## FAQ

### Is my data shared with third parties?

Nope. This repository creator is not sharing data with third parties. This makes the project solely dependent on the community if any new glitch is discovered. The only peoples capable of collecting data are the homeserver owners and third-party stuff.

### Why is the list of homeservers empty by default instead of having default homeservers like matrix.org?

This helps new matrix users not get lost when they are being guided to use a specific new homeserver.

### My website that is hosting this client was blocked from access by browser extensions.

This client sends notification permission requests at the exact moment the page is loaded. Some security extensions may consider this a privacy violation. Sometimes this type of thing doesn't happen on the Pony House domain because I (JasminDreasond) always try to contact the staff of these extensions so the domain can be added to the whitelist.

### Can I completely disable IPFS and Web3?

Yep. To disable it via the client, you need to go to the settings tabs. To permanently deactivate the features, you need to modify the `.env` file so you can deploy a client without access to the features.

### My browser keeps opening crypto wallet randomly

It looks like you are using a browser that has a native crypto wallet. This is not an extension installed in your browser, I'm referring to something in your browser itself. (Example: Brave and Opera) And even with crypto features turned off, for some mysterious reason your browser still thinks it's a good idea to send you a ad to try force you to use the browser crypto wallet. If you want to disable this, research how to disable your browser's native crypto wallet.

### This client has web3 functionalities. Is this matrix client a crypto wallet?

Nope. Pony House has access to crypto wallet APIs that are installed in your browser or on your computer. And this function can be turned off in the settings.

### Does the client support the purchase and sale of NFTs?

Nope. But you can install mods from third-party creators that code this type of feature.

### What is my guarantee about using crypto resources on Pony House?

Pony House's crypto resources are developed to be as secure as possible from trusted sources. Normally limited to personal uses between users only. (This is a CHAT SOFTWARE, not a crypto marketplace)

When installing third-party mods involving web3, you are assuming that everything is at your own risk between you and the third-party developer. (including any accident of loss of funds due to lack of care on the part of both the user and the third-party developer)

## Cinny Fork

Pony House started on a Cinny fork from the commit below:

https://github.com/cinnyapp/cinny/tree/3969c9501a7053b2d4edbba17df11e372f204d69

https://github.com/Pony-House/OLD-Client
