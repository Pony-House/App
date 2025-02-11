import CIDTool from 'cid-tool';

import tinyConsole from '@src/util/libs/console';

import envAPI from './env';
import storageManager from './localStorage/StorageManager';

export function getIpfsCfg(folder, getDefault = true, domainsParse = false) {
  const content = storageManager.getJson('ponyHouse-ipfs', 'obj');

  if (getDefault) {
    content.ipfsEnabled = typeof content.ipfsEnabled === 'boolean' ? content.ipfsEnabled : true;
    content.useGatewayOnOpen =
      typeof content.useGatewayOnOpen === 'boolean' ? content.useGatewayOnOpen : true;

    content.publicGateway =
      typeof content.publicGateway === 'string' && content.publicGateway.length > 0
        ? content.publicGateway
        : 'https://ipfs.io/';
    if (domainsParse) {
      try {
        content.publicGateway = new URL(content.publicGateway);
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Public Gateway IPFS Error');
      }
    }

    content.subdomainPublicGateway =
      typeof content.subdomainPublicGateway === 'string' &&
      content.subdomainPublicGateway.length > 0
        ? content.subdomainPublicGateway
        : 'https://dweb.link/';
    if (domainsParse) {
      try {
        content.subdomainPublicGateway = new URL(content.subdomainPublicGateway);
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'SubDomain Public Gateway IPFS Error');
      }
    }

    content.apiIpfs =
      typeof content.apiIpfs === 'string' && content.apiIpfs.length > 0
        ? content.apiIpfs
        : 'http://127.0.0.1:5001/';
    if (domainsParse) {
      try {
        content.apiIpfs = new URL(content.apiIpfs);
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'IPFS API Error');
      }
    }

    content.localGateway =
      typeof content.localGateway === 'string' && content.localGateway.length > 0
        ? content.localGateway
        : 'http://localhost:8080/';
    if (domainsParse) {
      try {
        content.localGateway = new URL(content.localGateway);
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Local Gateway IPFS Error');
      }
    }
  }

  if (typeof folder === 'string' && folder.length > 0) {
    if (typeof content[folder] !== 'undefined') return content[folder];
    return null;
  }

  if (!envAPI.get('IPFS')) content.ipfsEnabled = false;
  return content;
}

export function setIpfsCfg(folder, value) {
  const content = getIpfsCfg(null, false);
  content[folder] = value;
  storageManager.setJson('ponyHouse-ipfs', content);
}

export function convertIpfsGateway(tinyUrl, vanillaUrl, type = 'base32') {
  const cfg = getIpfsCfg(null, true, true);

  let url;
  if (typeof tinyUrl === 'string') {
    url = new URL(tinyUrl);
  } else {
    url = tinyUrl;
  }

  if (
    typeof vanillaUrl === 'string' &&
    url.protocol === 'ipfs:' &&
    cfg.ipfsEnabled &&
    cfg.useGatewayOnOpen &&
    cfg.subdomainPublicGateway
  ) {
    const finalResult = {};

    const tinyPath = url.pathname.replace(vanillaUrl.substring(url.protocol.length), '');
    const hash = vanillaUrl.substring(
      url.protocol.length + 2,
      vanillaUrl.length -
        Number(typeof url.port === 'string' && url.port.length > 0 ? url.port.length + 1 : 0) -
        url.search.length -
        Number(typeof tinyPath === 'string' && tinyPath !== '/' ? tinyPath.length : 0),
    );

    if (typeof CIDTool[type] === 'function') {
      finalResult.host = `${CIDTool[type](hash)}.ipfs.${cfg.subdomainPublicGateway.host}`;
      finalResult.hostname = `${CIDTool[type](hash)}.ipfs.${cfg.subdomainPublicGateway.hostname}`;

      finalResult.port = cfg.subdomainPublicGateway.port;
      finalResult.protocol = cfg.subdomainPublicGateway.protocol;

      finalResult.pathname = tinyPath;
    } else {
      finalResult.host = cfg.publicGateway.host;
      finalResult.hostname = cfg.publicGateway.hostname;

      finalResult.pathname = `/ipfs/${hash}${tinyPath}`;

      finalResult.port = cfg.publicGateway.port;
      finalResult.protocol = cfg.publicGateway.protocol;
    }

    finalResult.search = url.search;
    finalResult.hash = url.hash;

    finalResult.password = url.password;
    finalResult.username = url.username;

    finalResult.searchParams = url.searchParams;

    finalResult.origin = `${finalResult.protocol}//${finalResult.hostname}${typeof finalResult.port === 'string' && finalResult.port.length > 0 ? `:${finalResult.port}` : ''}`;
    finalResult.href = `${finalResult.origin}${finalResult.pathname}${finalResult.search}`;
    finalResult.origin += '/';

    return finalResult;
  }

  return url;
}

if (__ENV_APP__.MODE === 'development') {
  global.ipfsApi = {
    convertGateway: convertIpfsGateway,
    getCfg: getIpfsCfg,
    setCfg: setIpfsCfg,
  };
}
