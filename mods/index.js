// import startTest from './test';

// import helloWorld from './lib/hello-world';
// import { startSinkingYachts } from './messages/sinking.yachts';
import customMessages from './messages/customMessages';
import unstoppableDomains from './web3/unstoppableDomains';

import catppuccinTheme from './themes/catppuccin';
import startIPFS from './IPFS';
import startEthers from './web3/ethers';

export function startCustomThemes() {
  catppuccinTheme();
}

export default function startMods(firstTime) {
  startIPFS(firstTime);
  startEthers(firstTime);
  unstoppableDomains(firstTime);

  // startSinkingYachts(firstTime);
  // helloWorld(firstTime);
  // startTest(firstTime);

  customMessages(firstTime);
}
