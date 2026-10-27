import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAssistantMarkdown as render} from '../src/features/assistant/assistant-markdown.js';

test('replies render channel emphasis, lists, links, code and tables',()=>{
 const html=render('Posted **#eboard-chat** for *review*.\n\n- First\n- Second\n\n[Source](https://example.com/event)\n\n`inline`\n\n```js\nconst x = 1;\n```\n\n| Time | Room |\n| --- | --- |\n| 3 PM | 101 |');
 for(const fragment of ['<strong>#eboard-chat</strong>','<em>review</em>','<ul>','<code>inline</code>','<pre>','<table>'])assert(html.includes(fragment));
 assert(html.includes('target="_blank"'));assert(html.includes('rel="noopener noreferrer"'));
});

test('raw HTML, image attributes and code never become executable markup',()=>{
 const html=render('<script>window.injected=true</script>\n\n<img src=x onerror=alert(1)>\n\n![<img onerror=alert(1)>](https://example.com/track.png)\n\n```html\n<script>bad()</script>\n```');
 assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));
});

test('only absolute HTTP(S) links without credentials are clickable',()=>{
 for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','javascript&#x3a;alert(1)','data:text/html,bad','file:///secret','mailto:member@example.com','https://user:pass@example.com/','/relative'])assert(!render(`[link](${url})`).includes('<a '),url);
 for(const url of ['https://example.com/event','http://localhost:5173/'])assert(render(`[link](${url})`).includes('<a '));
});

test('streamed Markdown prefixes stay safe and final delimiters create formatting',()=>{
 const text='Read **#eboard-chat** and [the source](https://example.com/). <script>bad()</script>';
 for(let length=1;length<=text.length;length++)assert(!render(text.slice(0,length)).includes('<script>'));
 assert(!render('Read **#eboard').includes('<strong>'));assert(render('Read **#eboard-chat**').includes('<strong>#eboard-chat</strong>'));
});
