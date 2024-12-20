import { tinyCrypto } from './base';
import { toast } from '@src/util/tools';

let header;
export function setEthereumStatusButton(newHeader) {
  header = newHeader;
}
export default function startStatus() {
  // Detect Meta to Update Icon
  const checkConnection = function (data) {
    if (data && header) {
      if (!tinyCrypto.existEthereum()) {
        if (!__ENV_APP__.ELECTRON_MODE)
          toast("You don't have a ethereum Wallet installed in your browser!", 'Ethereum Wallet');

        if (header) header.addClass('ethereum-none');
        tinyCrypto.allowActions = false;
      } else {
        if (header) header.removeClass('ethereum-none');
        tinyCrypto.allowActions = true;
      }
    }
  };

  if (tinyCrypto.existEthereum()) {
    tinyCrypto.on('readyProvider', checkConnection);
    tinyCrypto.on('checkConnection', checkConnection);
  }
}
