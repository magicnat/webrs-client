import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import LocalEchoController from './3rdparty/local-echo/LocalEchoController';
import 'xterm/css/xterm.css';
import './css/style.css';

let tryBlock: boolean = false;
let blocked: boolean = true;
let ready: boolean = false;
let lastIsHelp: boolean = false;
let serverBuffer: string = '';

const blockKeys = ['\x14', '\x1f', '\x17', '\x15', '\x19', '\t'];

let resolveMore: () => void = function() {};

let more = function() {
    blocked = true;
    let p = new Promise<void>((res, _) => {
        resolveMore = function() {
            res();
            blocked = false;
            console.log('input unblocked.');
        };
    });
    if (!tryBlock) resolveMore();
    if (tryBlock) console.log('blocked input.');
    return p;
}

async function reader() {
    while (ready) {
        try {
            await more();
            await (function () {
                let p = localEcho.read('rs> ', '> ');
                console.log('cli read head ready');
                if (serverBuffer != '') {
                    console.log(`inject buffer: "${serverBuffer}"`);
                    localEcho.handleTermData(serverBuffer);
                    serverBuffer = '';
                }
                return p;
            })();
        } catch (e) {
            console.warn(`abort cli: ${e}`);
        }
    }
}

function attach() {
    ws.onmessage = (message) => {
        var msg = message.data as string;
        console.log(`in: "${msg}"`);

        let resMatch = msg.match(/rs> +([^\n]*) *$/);

        if (resMatch) {
            serverBuffer = resMatch[1];
            console.log(`update server-side in buffer: ${serverBuffer}`);
        }

        if (tryBlock && resMatch) {
            if (blocked) {
                tryBlock = false;
                resolveMore();
            }
        }

        if (!msg.includes('rs> ')) {
            tryBlock = true;
        }

        if (!msg.includes('\n') || msg == '\n') return;
        if (msg == '\r\n') return;
        msg = msg.replace(/\?/g, '');

        if (msg.includes('--More--')) {
            tryBlock = true;
        }

        console.log(`blocked: ${blocked}`);
        if (!ready) {
            term.write(`Connected to ${url}.\r\n`);
            ready = true;
            term.focus();
            reader();
        }

        localEcho.abortRead('data in');

        if (msg.includes('rs> ') && lastIsHelp) {
            lastIsHelp = false;
            tryBlock = false;
            resolveMore();
        }
        
        msg = msg.replace(/rs> /g, '');

        if (msg == '\r\n') {
            console.log(`ignored server-side newline.`);
            return;
        }

        term.write(msg);
        console.log(`to-term: "${msg}"`);
    }

    term.onData((data) => {
        if (data.length < 0) return;
        if (data[0] == '?') {
            lastIsHelp = true;
            localEcho._input = localEcho._input.replace(/\?/g, '');
        }
        if (blockKeys.includes(data[0])) return;
        ws.send(data);
        console.log(`out: "${data}"`);
    });
}

const url = 'wss://wsrs.nat.moe/rs';
let ws = new WebSocket(url);

const term = new Terminal();

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const localEcho = new LocalEchoController();
term.loadAddon(localEcho);

term.open(document.getElementById('terminal'));
fitAddon.fit();

term.write(`Trying ${url}...\r\n`);

window.onresize = () => fitAddon.fit();
ws.onopen = () => attach();
ws.onerror = () => {
    ready = false;
    term.write('Connection refused.\r\n');
}
ws.onclose = () => {
    ready = false;
    term.write('Connection closed by foreign host.\r\n');
}
