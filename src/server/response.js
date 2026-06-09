export function createResponse(serverRes) {
  const res = {
    ended: false,
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      res.headers[name] = value;
      return res;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.headers['Content-Type'] = 'application/json; charset=utf-8';
      res.end(JSON.stringify(data));
    },
    redirect(url) {
      res.statusCode = 302;
      res.headers.Location = url;
      res.end('');
    },
    send(body) {
      res.end(body);
    },
    end(body = '') {
      if (res.ended) return;
      res.ended = true;
      serverRes.writeHead(res.statusCode, res.headers);
      serverRes.end(body);
    },
  };
  return res;
}
