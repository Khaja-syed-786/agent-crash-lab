// Empirical map: which env combinations make Node built-in fetch send http://127.0.0.1:11434 via HTTP_PROXY? Loopback listeners only.
// Binds 127.0.0.1:11434 as a stand-in. Do not run where a real Ollama is listening; the script exits if the port is busy.
import http from 'node:http';import {spawn} from 'node:child_process';
const hits={proxy:0,direct:0};
const proxy=http.createServer((q,s)=>{hits.proxy++;s.end('{}');});proxy.on('connect',(q,sock)=>{hits.proxy++;sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
const direct=http.createServer((q,s)=>{hits.direct++;s.end('{"version":"MOCK"}');});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));await new Promise(r=>direct.listen(11434,'127.0.0.1',r));
const P='http://127.0.0.1:'+proxy.address().port,E={NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P};
const cases=[['default (no proxy vars)',{}],['HTTP_PROXY only, env-proxy off',{HTTP_PROXY:P}],['env-proxy + HTTP_PROXY',E],['env-proxy + http_proxy',{NODE_USE_ENV_PROXY:'1',http_proxy:P}],['env-proxy + HTTPS_PROXY only',{NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:P}],['NODE_OPTIONS=--use-env-proxy + HTTP_PROXY',{NODE_OPTIONS:'--use-env-proxy',HTTP_PROXY:P}],
['E + NO_PROXY=127.0.0.1',{...E,NO_PROXY:'127.0.0.1'}],['E + no_proxy=127.0.0.1',{...E,no_proxy:'127.0.0.1'}],['E + NO_PROXY=127.0.0.1:11434',{...E,NO_PROXY:'127.0.0.1:11434'}],['E + NO_PROXY=*',{...E,NO_PROXY:'*'}],['E + NO_PROXY=" 127.0.0.1 " (spaces)',{...E,NO_PROXY:' 127.0.0.1 '}],['E + NO_PROXY="example.test,127.0.0.1"',{...E,NO_PROXY:'example.test,127.0.0.1'}],['E + NO_PROXY="example.test 127.0.0.1"',{...E,NO_PROXY:'example.test 127.0.0.1'}],
['E + NO_PROXY=localhost',{...E,NO_PROXY:'localhost'}],['E + NO_PROXY=127.0.0.0/8',{...E,NO_PROXY:'127.0.0.0/8'}],['E + NO_PROXY=127.0.0.1:9999',{...E,NO_PROXY:'127.0.0.1:9999'}],['E + NO_PROXY=.0.0.1',{...E,NO_PROXY:'.0.0.1'}],['E + no_proxy="" + NO_PROXY=127.0.0.1',{...E,no_proxy:'',NO_PROXY:'127.0.0.1'}],['E + no_proxy=localhost + NO_PROXY=127.0.0.1',{...E,no_proxy:'localhost',NO_PROXY:'127.0.0.1'}],['E + http_proxy="" + HTTP_PROXY=P',{NODE_USE_ENV_PROXY:'1',http_proxy:'',HTTP_PROXY:P}]];
const rows=[];
for(const [name,extra] of cases){
  const before={...hits};
  await new Promise(r=>{const c=spawn(process.execPath,['-e',"const t=setTimeout(()=>process.exit(3),3000);fetch('http://127.0.0.1:11434/api/version',{signal:AbortSignal.timeout(2500)}).then(r=>r.text()).catch(()=>{}).finally(()=>{clearTimeout(t);process.exit(0)})"],{env:{PATH:process.env.PATH,...extra},stdio:'ignore'});c.on('exit',r);});
  const row={case:name,viaProxy:hits.proxy-before.proxy>0,direct:hits.direct-before.direct>0};rows.push(row);
  console.log(`${name.padEnd(46)} viaProxy:${row.viaProxy} direct:${row.direct}`);
}
console.log('JSON '+JSON.stringify({node:process.version,rows}));
proxy.close();direct.close();
