module.exports = function parseMagnet(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('magnet:?')) return null;
  const params = new URLSearchParams(uri.substring(8));
  const xt = params.get('xt');
  let infoHash = null;
  if (xt) {
    const match = xt.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/);
    if (match) infoHash = match[1].toLowerCase();
  }
  return {
    infoHash,
    name: params.get('dn')
  };
};
