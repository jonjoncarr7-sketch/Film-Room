// ============ real data ============
const D=JSON.parse(document.getElementById("data").textContent);
const NAME=D.names,TR=D.tr,TEND=D.tend,INJ=D.inj,PLAYERS=D.players,W5=D.w5;
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ord=n=>{const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])};
const poss=n=>/s$/i.test(n)?n+"'":n+"'s";
const sgn=v=>v>0?"+"+v:String(v);
const fmtTime=t=>{let [h,m]=t.split(":").map(Number);const ap=h>=12?"PM":"AM";h=h%12||12;return `${h}:${String(m).padStart(2,"0")} ${ap} ET`};
const fmtDate=d=>{const [y,m,dd]=d.split("-").map(Number);return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]+" "+dd};

const STAT={pass:{label:"Pass yds",long:"passing yards",d:"pass",f:"pass_",vol:"att",rk:"pr",yd:"pa"},rush:{label:"Rush yds",long:"rushing yards",d:"rush",f:"rush",vol:"car",rk:"rr",yd:"ra"},
  rec:{label:"Rec yds",long:"receiving yards",d:"pass",f:"rec",vol:"tgt",rk:"pr",yd:"pa"},recs:{label:"Receptions",long:"receptions",d:"pass",f:"recs",vol:"tgt",rk:"pr",yd:"pa",plus:10,unit:"catches"},
  td:{label:"Anytime TD",long:"touchdowns",d:"pass",f:"td",vol:"rz",rk:"tr",yd:"pts",plus:3,unit:"TDs"},ptd:{label:"Pass TDs",long:"passing TDs",d:"pass",f:"ptd",vol:"att",rk:"tr",yd:"pts",plus:4,unit:"TDs"}};
const VOLL={att:"Pass attempts",car:"Carries",tgt:"Targets",rz:"Red-zone touches"};
const TEAMRK={pr:["passARk","passA","yds"],rr:["rushARk","rushA","yds"],tr:["papgRk","papg","pts"]};
const WORDS=["Elite","Good","Average","Weak"];
const tierIx=r=>r<=8?0:r<=16?1:r<=24?2:3;
const word=r=>r?WORDS[tierIx(r)]:"—";
const vsDef=r=>r?`<span class="chip ${["bad","mid","neu","good"][tierIx(r)]}">${word(r)}</span>`:`<span class="chip neu">—</span>`;
const a_n=w=>/^[AEIOU]/i.test(w)?"an":"a";
const dWord=stat=>STAT[stat].rk==="tr"?"scoring defense":STAT[stat].d==="rush"?"run defense":"pass defense";

// ============ state ============
const pick0=PLAYERS.find(p=>p.name==="Josh Allen")||PLAYERS[0];
const st={skipEarly:false,mode:"props",pid:pick0.id,stat:pick0.stats[0],side:"over",line:0,sel:0,tab:"tape",game:null,gtab:"pick",filter:"all"};
const P=()=>PLAYERS.find(p=>p.id===st.pid);
const fmt=n=>Number.isInteger(n)?String(n):n.toFixed(1);
const lineTxt=(stat,side,line)=>side==="under"?`under ${Math.round(line+.5)}`:`${Math.round(line+.5)}+`;
const res=v=>(st.side==="over"?v>st.line:v<st.line)?"h":"m";
const rate=(h,n)=>n?Math.round(h/n*100):0;
const colorVar=r=>r>=60?"var(--hit)":r<=40?"var(--miss)":"var(--accent)";

const GCACHE=new Map();
function medSnap(p){if(p._med!==undefined)return p._med;const v=p.log.map(g=>g.snap).filter(x=>x!=null).sort((a,b)=>a-b);return p._med=v.length?v[Math.floor(v.length/2)]:null}
function baseGames(p,stat){const key=p.id+"|"+stat;if(GCACHE.has(key))return GCACHE.get(key);const S=STAT[stat],med=medSnap(p);
  const out=p.log.map(g=>({...g,v:g[S.f],vol:g[S.vol],fam:g.man==null?null:(g.man>=33?"Man":"Zone"),rank:g[S.rk],yds:g[S.yd],
    early:g.snap!=null&&med!=null&&med>=50&&g.snap<med*.5,other:g.t!==p.team}));GCACHE.set(key,out);return out}
function games(p,stat){const b=baseGames(p,stat);return st.skipEarly?b.filter(g=>!g.early):b}
const earlyCount=(p,stat)=>baseGames(p,stat).filter(g=>g.early).length;
function defLine(p,stat){const gs=baseGames(p,stat),a=gs.reduce((s,g)=>s+g.v,0)/Math.max(gs.length,1);return stat==="td"?.5:STAT[stat].plus?Math.max(1,Math.round(a))-.5:Math.max(5,Math.round(a/5)*5)-.5}
st.line=defLine(pick0,st.stat);st.sel=pick0.log.length-1;

// next game for a team
function nextOf(team){const gid=D.next[team];if(!gid)return null;const g=D.nextg[gid],home=g.home===team;
  const w5=W5.find(x=>x.id===gid)||null;return {g,gid,home,opp:home?g.away:g.home,w5}}
function projOf(g){ // home/away projected points
  if(g.spread!=null&&g.total)return {h:(g.total+g.spread)/2,a:(g.total-g.spread)/2,src:"odds"};
  const H=TR[g.home],A=TR[g.away];return {h:(H.ppg+A.papg)/2+1.2,a:(A.ppg+H.papg)/2-1.2,src:"stats"}}

function wxInfo(w5){const w=w5&&w5.wx;
  if(!w)return {chip:["Forecast later","neu"],head:"No forecast yet",eff:"Forecasts come out closer to game day.",pass:0,short:""};
  if(w[0]==="in")return {chip:["Indoors","neu"],head:"Playing indoors",eff:`${w[3]} Weather won't matter.`,pass:0,short:""};
  if(w[2]>=60)return {chip:[`Rain ${w[2]}%`,"mid"],head:`Rain likely: ${w[2]}%`,eff:`${w[3]} A wet ball usually means more running, more drops and more fumbles. Small lean toward passing unders.`,pass:-1,short:"likely rain"};
  if(/moderate/i.test(w[3]))return {chip:[`${w[1]}° · breezy`,"mid"],head:`Breezy, ${w[1]}°`,eff:`${w[3]}`,pass:0,short:""};
  return {chip:[`${w[1]}° · ${w[2]}% rain`,"good"],head:`Good weather, ${w[1]}°`,eff:`${w[3]} No real weather impact.`,pass:0,short:""}}

// ============ search ============
function findPlayers(q){const s=q.toLowerCase().replace(/[.'’]/g,"");
  return PLAYERS.map(p=>{const n=p.name.toLowerCase().replace(/[.'’]/g,""),parts=n.split(" ").filter(w=>!/^(jr|sr|ii|iii|iv)$/.test(w));
    let sc=0;if(s.includes(n))sc=3;else if(parts.length>1&&parts[parts.length-1].length>2&&s.includes(parts[parts.length-1]))sc=2;else if(parts[0].length>2&&s.includes(parts[0]))sc=1;
    return {p,sc}}).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc)}
function parse(q){
  const m=findPlayers(q);if(!m.length)return null;
  const s=q.toLowerCase();let stat=null;
  if(/pass(ing)? ?td|td pass|touchdown pass/.test(s))stat="ptd";else if(/\btd|touchdown|score/.test(s))stat="td";else if(/rush|run|carr/.test(s))stat="rush";else if(/recept|catch/.test(s))stat="recs";else if(/rec|receiv/.test(s))stat="rec";else if(/pass|throw/.test(s))stat="pass";
  if(stat==="td"){const m2=m.filter(x=>x.p.stats.includes("td"));if(m2.length)m.splice(0,m.length,...m2)}
  const PRI="QB RB WR TE";
  const top=m.filter(x=>x.sc===m[0].sc).map(x=>x.p).sort((a,b)=>((stat&&!a.stats.includes(stat))-(stat&&!b.stats.includes(stat)))||(PRI.indexOf(a.pos)-PRI.indexOf(b.pos))||(b.log.length-a.log.length));const p=top[0];
  const num=s.match(/(\d+(?:\.\d+)?)/);
  if(!stat&&num&&+num[1]<15&&p.stats.includes("recs"))stat="recs";
  if(stat==="td"&&!p.stats.includes("td")&&p.stats.includes("ptd"))stat="ptd";
  if(!stat||!p.stats.includes(stat))stat=p.stats[0];
  const side=/\bunder\b|\bless\b|\bfewer\b/.test(s)?"under":"over";
  let line=num?parseFloat(num[1]):defLine(p,stat)+.5;if(!num)line-=.5;
  if(Number.isInteger(line))line=Math.max(1,line)-.5;
  return {pid:p.id,stat,side,line,alts:top.slice(1,6)};
}

// ============ PLAYER PROPS ============
function renderControls(){
  const p=P(),inj=(INJ[p.team]||[]).find(i=>i.n===p.name);
  document.getElementById("controls").innerHTML=`
    <div class="who"><div class="badge">${p.pos}</div><div><h2>${esc(p.name)}</h2><small>${NAME[p.team]} · ${p.team}${inj?` · <span class="chip ${inj.s==="Questionable"||inj.s==="Limited"?"mid":"bad"}">${inj.s==="DNP"?"Missed practice":inj.s}${inj.i?" · "+esc(inj.i):""}</span>`:""}</small></div></div>
    <div class="row">
      <div class="seg" role="group" aria-label="Stat">${p.stats.map(k=>`<button data-stat="${k}" aria-pressed="${k===st.stat}">${STAT[k].label}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Over or under">${["over","under"].map(k=>`<button data-side="${k}" aria-pressed="${k===st.side}">${cap(k)}</button>`).join("")}</div>
      ${STAT[st.stat].plus?`<div class="seg plus" role="group" aria-label="${STAT[st.stat].label}">${[...Array(STAT[st.stat].plus)].map((_,i)=>`<button data-plus="${i+1}" aria-pressed="${st.line===i+.5}">${st.side==="under"?"Under "+(i+1):(i+1)+"+"}</button>`).join("")}</div>`:`
      <div class="stepper"><button data-step="-5" aria-label="5 fewer yards">−</button><span class="plusin">${st.side==="under"?`<b style="padding-left:8px">U</b>`:""}<input id="line" type="number" step="5" min="1" value="${Math.round(st.line+.5)}" aria-label="Yards">${st.side==="under"?"":"<b>+</b>"}</span><button data-step="5" aria-label="5 more yards">+</button></div>`}
      ${inSlip(curLeg())?`<button class="addbtn in" data-add>✓ In your slip</button>`:`<button class="addbtn" data-add>+ Add to slip</button>`}
    </div>
    <p class="linehint">${st.line===defLine(p,st.stat)?`<b>Starting line is his average</b>, not a sportsbook line. Change it to match your book.`:`<b>Your line:</b> ${lineTxt(st.stat,st.side,st.line)} ${STAT[st.stat].long}. <button class="linkish" data-resetline>Reset to his average</button>`}</p>`;
}

function chart(gs){
  const W=640,H=230,pl=40,pr=10,pt=20,pb=24;
  const m=Math.max(...gs.map(g=>g.v),st.line,1)*1.12;
  const step=m>150?50:m>60?20:m>20?10:m>8?2:1;const max=Math.ceil(m/step)*step;
  const y=v=>pt+(H-pt-pb)*(1-Math.max(0,v)/max);
  const bw=(W-pl-pr)/gs.length;
  const ticks=[0,max/2,max].map(t=>`<line class="grid" x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${pl-8}" y="${y(t)+4}" text-anchor="end">${Math.round(t)}</text>`).join("");
  const bars=gs.map((g,i)=>{const x=pl+i*bw+bw*.17,w=bw*.66,top=Math.min(y(g.v),y(0)-3);
    return `${g.early?`<text class="emark" x="${(x+w/2).toFixed(1)}" y="${(top-4).toFixed(1)}" text-anchor="middle">!</text>`:""}<rect class="bar ${res(g.v)} ${i===st.sel?"sel":""}${g.early?" early":""}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(y(0)-top).toFixed(1)}" rx="3"/>`}).join("");
  const s=gs[st.sel],sx=pl+st.sel*bw+bw/2;
  const hit=gs.map((g,i)=>`<rect class="hitbox" data-i="${i}" x="${pl+i*bw}" y="${pt}" width="${bw}" height="${H-pt-pb}"><title>'${g.s} ${g.w} ${g.h?"vs":"@"} ${g.o}: ${g.v}${g.early?" (limited snaps: "+g.snap+"%)":""}${g.other?" (with "+g.t+")":""}</title></rect>`).join("");
  const ly=y(st.line);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Last ${gs.length} games bar chart">
    ${ticks}${bars}
    <line class="lineMark" x1="${pl}" x2="${W-pr}" y1="${ly}" y2="${ly}"/>
    <text class="lineLbl" x="${W-pr}" y="${ly-6}" text-anchor="end">${lineTxt(st.stat,st.side,st.line).toUpperCase()}</text>
    <text class="vlbl" x="${sx}" y="${Math.min(y(s.v),y(0)-3)-6}" text-anchor="middle">${s.v}</text>
    <text class="tick" x="${pl}" y="${H-4}">'${gs[0].s} ${gs[0].w}</text><text class="tick" x="${W-pr}" y="${H-4}" text-anchor="end">'${gs[gs.length-1].s} ${gs[gs.length-1].w}</text>
    ${hit}</svg>`;
}

function gameCard(g){
  const r=res(g.v),chip=r==="h"?'<span class="chip good">Hit</span>':'<span class="chip bad">Miss</span>';
  const w=word(g.rank).toLowerCase(),dw=dWord(st.stat),when=g.s==="26"?"this season":"in 2025";
  const result=g.m==null?"":g.m>0?`Won by ${g.m}`:g.m<0?`Lost by ${-g.m}`:"Tie";
  return `<div class="game" id="game">
    <div class="ghead">
      <div><div class="when">20${g.s} · ${g.w} · ${result}${g.snap!=null?` · ${g.snap}% of snaps`:""}</div><div class="opp">${g.h?"vs":"@"} ${NAME[g.o]}</div>${g.other||g.early?`<div class="gtags">${g.other?`<span class="chip neu">With the ${NAME[g.t]}</span>`:""}${g.early?`<span class="chip mid">Limited snaps · ${g.snap}%</span>`:""}</div>`:""}</div>
      <div class="gval"><b>${g.v}</b>${chip}</div>
    </div>
    <p>He faced ${a_n(w)} <b>${w} ${dw}</b> (${ord(g.rank)} ${when})${g.cov?` that played <b>${g.cov}</b> most in this game`:""}.</p>
    <div class="list">
      <div class="li"><span class="k">${cap(dw)} ${when}</span><span class="v">${vsDef(g.rank)}<small>${ord(g.rank)} · ${g.yds} ${TEAMRK[STAT[st.stat].rk][2]} allowed/gm</small></span></div>
      <div class="li"><span class="k">Pass rush ${when}</span><span class="v">${vsDef(g.kr)}<small>${ord(g.kr)} in sack rate</small></span></div>
      <div class="li"><span class="k">Coverage this game</span><span class="v">${g.cov?`${g.cov}<small>${g.man}% man</small>`:`<small>Not charted for 2026 yet</small>`}</span></div>
      <div class="li"><span class="k">${VOLL[STAT[st.stat].vol]}</span><span class="v">${g.vol}</span></div>${st.stat==="td"?`<div class="li"><span class="k">Goal-line carries (inside the 5)</span><span class="v">${g.gl}</span></div>`:""}
    </div></div>`;
}

const splitRows=rows=>`<div class="splits">${rows.map(([l,arr])=>{const h=arr.filter(g=>res(g.v)==="h").length,r=rate(h,arr.length);
  return `<div class="split"><div class="l">${l}<small>${arr.length} game${arr.length===1?"":"s"}</small></div><div class="meter" style="--c:${colorVar(r)}"><i style="width:${r}%"></i></div><div class="r" style="color:${colorVar(r)}">${h}/${arr.length}</div></div>`}).join("")}</div>`;

const COVORDER=["Cover 0","Cover 1","2-Man","Cover 2","Cover 3","Cover 4","Cover 6","Cover 9"];

function render(){
  const p=P(),gs=games(p,st.stat),n=gs.length,S=STAT[st.stat],dw=dWord(st.stat),LT=lineTxt(st.stat,st.side,st.line);
  if(st.sel>=n)st.sel=n-1;
  const dec=!!S.plus,unitW=S.unit||"yards";
  const rs=gs.map(g=>res(g.v)),hits=rs.filter(x=>x==="h").length;
  const vals=gs.map(g=>g.v),mean=vals.reduce((a,b)=>a+b,0)/n,avg=dec?+mean.toFixed(1):Math.round(mean);
  const l5=rs.slice(-5).filter(x=>x==="h").length;
  const over=st.side==="over";

  const summary=`
  <section class="card">
    <div class="score">
      <div class="big">${hits}<span>/${n}</span></div>
      <p>Had <b>${LT} ${S.long}</b> in ${hits} of his last ${n} games.</p>
    </div>
    <div class="strip" aria-hidden="true">${rs.map((x,i)=>`<i class="${x}${gs[i].early?" early":""}${gs[i].other?" other":""}"></i>`).join("")}</div>
    <div class="stripkey"><span>'${gs[0].s} ${gs[0].w}</span><span>Most recent</span></div>
    ${(()=>{const ec=earlyCount(p,st.stat),ot=[...new Set(gs.filter(g=>g.other).map(g=>g.t))];const bits=[];
      if(ec)bits.push(`<button class="toggle" data-skipearly aria-pressed="${st.skipEarly}">${st.skipEarly?`✓ Leaving out ${ec} game${ec===1?"":"s"} with limited snaps`:`Leave out ${ec} game${ec===1?"":"s"} with limited snaps`}</button>`);
      if(ot.length)bits.push(`<span class="hint">Includes ${gs.filter(g=>g.other).length} game${gs.filter(g=>g.other).length===1?"":"s"} with the ${ot.map(t=>NAME[t]).join(" and the ")}.</span>`);
      return bits.length?`<div class="sumnotes">${bits.join("")}</div>`:""})()}
  </section>`;

  const tape=`
  <section class="card">
    <div class="take"><b>${st.stat==="td"?`Scored in ${gs.filter(g=>g.td>0).length} of ${n} games`:`Averages ${avg}${dec?" "+unitW:""}`}</b><p>${over?`He needs ${Math.round(st.line+.5)}${dec?"":" "+unitW} to hit ${LT}.`:`The under hits if he stays at ${Math.round(st.line-.5)} or less.`} In his last 5 games it hit ${l5} time${l5===1?"":"s"}.</p></div>
    <div class="tiles">
      <div class="tile"><small>Average</small><b>${avg}</b></div>
      <div class="tile"><small>Last 5</small><b>${l5} of 5</b></div>
      <div class="tile"><small>Low – high</small><b>${Math.min(...vals)}–${Math.max(...vals)}</b></div>
    </div>
    <p class="hint">Tap any bar to see who he played.</p>
    <div id="chartwrap">${chart(gs)}</div>
    <div class="legend"><span style="--c:var(--hit)">Hit</span><span style="--c:var(--miss)">Miss</span><span style="--c:var(--accent)">Your line</span>${gs.some(g=>g.early)?'<span class="nosw"><b class="emk">!</b> Limited snaps (left early or small role)</span>':""}</div>
    ${gameCard(gs[st.sel])}
  </section>`;

  // next game
  const nx=nextOf(p.team),O=TR[nx.opp],tend=TEND[nx.opp];
  const H2=(p.h2hOpp===nx.opp?p.h2h:[]).map(g=>({...g,v:g[S.f]})),h2H=H2.filter(g=>res(g.v)==="h").length;
  const h2hCard=`<section class="card">
    <p class="label">Head to head · vs. ${NAME[nx.opp]} since 2022</p>
    ${H2.length?`<div class="take"><b>${cap(LT)} in ${h2H} of ${H2.length} game${H2.length===1?"":"s"}</b><p>He's averaged ${(H2.reduce((a,g)=>a+g.v,0)/H2.length).toFixed(dec?1:0)} ${S.long} against the ${NAME[nx.opp]}${H2.some(g=>g.t!==p.team)?", including games with a different team":""}.</p></div>
    <div class="list">${H2.slice().reverse().map(g=>`<div class="li"><span class="k">20${g.s} ${g.w} · ${g.h?"vs":"@"} ${nx.opp}${g.t!==p.team?` (with ${g.t})`:""} · ${g.m>0?"W":g.m<0?"L":"T"} ${g.m>0?"+":""}${g.m}</span><span class="v">${g.v}<span class="dot" style="--c:var(--${res(g.v)==="h"?"hit":"miss"})"></span></span></div>`).join("")}</div>`
    :`<p class="hint">He hasn't played the ${NAME[nx.opp]} since 2022.</p>`}
  </section>`;
  const TK=TEAMRK[S.rk],nRank=O[TK[0]],nAllowed=O[TK[1]],nw=word(nRank).toLowerCase();
  const sim=gs.filter(g=>g.rank&&Math.abs(g.rank-nRank)<=6);
  const simH=sim.filter(g=>res(g.v)==="h").length,simR=rate(simH,sim.length);
  const W=wxInfo(nx.w5);
  const when=`Week ${nx.g.week} · ${nx.g.day} ${fmtDate(nx.g.date)} · ${fmtTime(nx.g.time)}`;
  const next=`
  <section class="card">
    <p class="label">${when} · ${nx.home?"vs":"@"} ${NAME[nx.opp]}</p>
    <div class="take"><b>${sim.length?`${simH} of ${sim.length} vs. defenses like this`:`New kind of matchup`}</b><p>The ${NAME[nx.opp]} have ${a_n(nw)} ${nw} ${dw} this season (${ord(nRank)}, ${nAllowed} ${TK[2]==="pts"?"points":"yards"} allowed a game).${sim.length?` Against defenses ranked close to that, he got ${LT} in ${simH} of ${sim.length} games.`:""}</p></div>
    <div class="list">
      <div class="li"><span class="k">${cap(dw)}</span><span class="v">${vsDef(nRank)}<small>${ord(nRank)} · ${nAllowed} ${TK[2]}/gm</small></span></div>
      <div class="li"><span class="k">Pass rush</span><span class="v">${vsDef(O.sackRateRk)}<small>${O.sackRate}% sack rate</small></span></div>
      <div class="li"><span class="k">Coverage (2025)</span><span class="v">${tend?`${tend.mix[0][0]} most<small>${tend.man}% man</small>`:"—"}</span></div>
      <div class="li"><span class="k">Points allowed</span><span class="v">${O.papg}<small>${ord(O.papgRk)}</small></span></div>
      <div class="li"><span class="k">Weather</span><span class="v"><span class="chip ${W.chip[1]}">${W.chip[0]}</span></span></div>
    </div>
    ${sim.length?`<div class="meter" style="--c:${colorVar(simR)}"><i style="width:${simR}%"></i></div>`:""}
    <button class="linkbtn" data-tab="role">How he does vs. ${tend?tend.mix[0][0]:"each coverage"} →</button>
    <p class="hint">Ranks are from this season's games so far (${O.g} games). Coverage comes from 2025 charting, so coaching changes may matter.</p>
  </section>${h2hCard}`;

  // game flow
  const pj=projOf(nx.g),us=nx.home?pj.h:pj.a,them=nx.home?pj.a:pj.h,sp=+(us-them).toFixed(1),ad=Math.abs(sp),fav=sp>0?p.team:nx.opp;
  const head=ad<=3.5?["Looks like a close game","These teams are pretty even. Either one could win."]
    :ad<=7?[`${NAME[fav]} have the edge`,"Probably a one-score game, but one team is a bit better."]
    :sp>0?[`${NAME[p.team]} could win big`,"They're big favorites. This could turn into a blowout."]
    :[`${NAME[p.team]} could fall behind`,`The ${NAME[nx.opp]} are big favorites. This could get away from them.`];
  const script=ad<=3.5?"close":sp>0?"lead":"trail",passy=S.d==="pass";
  const helpsOver=script==="close"?null:(passy?script==="trail":script==="lead");
  const why={close:"Close games keep the whole playbook open. Game flow shouldn't push this prop much either way.",
    trail:passy?`Teams that fall behind throw more to catch up. That usually means more passing yards, catches and receiving yards.`:`Teams that fall behind stop running the ball. That usually means fewer rushing yards.`,
    lead:passy?`Teams with a big lead run the ball late to burn the clock. That can mean fewer passing yards, catches and receiving yards.`:`Teams with a big lead run the ball late to burn the clock. That usually means more rushing yards.`}[script];
  const lean=helpsOver===null?'<span class="chip neu">No strong lean</span>':(helpsOver===over)?`<span class="chip good">Good sign for ${LT}</span>`:`<span class="chip bad">Bad sign for ${LT}</span>`;
  const side=(offT,defT)=>{const o=TR[offT],d=TR[defT],e=d.papgRk-o.ppgRk;
    const edge=e>6?`<span class="chip good">${offT} offense has the edge</span>`:e<-6?`<span class="chip bad">${defT} defense has the edge</span>`:`<span class="chip neu">Even</span>`;
    return `<div class="side"><div class="sh"><span>When ${offT} has the ball</span>${edge}</div>
      <div class="vs"><div class="t"><b>${offT} offense</b><small>${word(o.ppgRk)} · ${o.ppg} pts a game</small></div><div class="x">VS</div>
      <div class="t" style="text-align:right"><b>${defT} defense</b><small>${word(d.papgRk)} · allows ${d.papg}</small></div></div></div>`};
  const flow=`
  <section class="card">
    <div class="take"><b>${head[0]}</b><p>${head[1]}</p></div>
    <div class="proj">
      <div class="pteam"><small>${p.team}</small><b>${Math.round(us)}</b></div>
      <div class="pmid"><b>${ad<1?"Even":`${fav} by ${fmt(ad)}`}</b>${pj.src==="odds"?"From betting lines":"Projected"}</div>
      <div class="pteam" style="text-align:right"><small>${nx.opp}</small><b>${Math.round(them)}</b></div>
    </div>
    ${side(p.team,nx.opp)}${side(nx.opp,p.team)}
    <div class="means"><p class="label">What it means for this prop</p>${lean}<p>${why}</p>${W.pass<0&&passy?`<p><b>Weather:</b> ${W.eff}</p>`:""}</div>
    <p class="label">How ${LT} did by game type</p>
    ${splitRows([["Close games (7 pts or less)",gs.filter(g=>g.m!=null&&Math.abs(g.m)<=7)],[`${p.team} won by 10+`,gs.filter(g=>g.m>=10)],[`${p.team} lost by 10+`,gs.filter(g=>g.m<=-10)]].filter(x=>x[1].length))}
    ${nx.w5?`<button class="linkbtn" data-goto="${nx.gid}">See the full ${nx.g.away} @ ${nx.g.home} breakdown →</button>`:""}
  </section>`;

  // splits
  const rows=[
    ["Last 5 games",gs.slice(-5)],["This season",gs.filter(g=>g.s==="26")],
    [`vs top-half ${dw}s`,gs.filter(g=>g.rank<=16)],[`vs bottom-half ${dw}s`,gs.filter(g=>g.rank>16)],
    ["vs man-heavy defenses ('25)",gs.filter(g=>g.fam==="Man")],["vs zone-heavy defenses ('25)",gs.filter(g=>g.fam==="Zone")],
    ["vs top-10 pass rushes",gs.filter(g=>g.kr<=10)],
    ["At home",gs.filter(g=>g.h)],["On the road",gs.filter(g=>!g.h)]
  ].filter(x=>x[1].length);
  const ranked=rows.filter(x=>x[1].length>=3).map(([l,a])=>[l,rate(a.filter(g=>res(g.v)==="h").length,a.length)]).sort((a,b)=>b[1]-a[1]);
  const best=ranked[0]||[rows[0][0],0],worst=ranked[ranked.length-1]||best;
  const splits=`
  <section class="card">
    <div class="take"><b>Best: ${best[0].replace(/^vs /,"vs. ")}</b><p>${cap(LT)} hits most ${best[0].toLowerCase()} (${best[1]}%). It hits least ${worst[0].toLowerCase()} (${worst[1]}%).</p></div>
    ${splitRows(rows)}
  </section>`;

  // log
  const log=`
  <section class="card">
    <p class="hint">Newest first. Tap a game to see the defense he faced.</p>
    <div style="overflow-x:auto"><table class="log">
      <thead><tr><th>Game</th><th>Opp</th><th>Result</th><th class="v">${{tgt:"Tgt",att:"Att",car:"Car",rz:"RZ"}[STAT[st.stat].vol]}</th><th class="v">${S.label}</th><th></th></tr></thead>
      <tbody>${gs.map((g,i)=>({g,i})).reverse().map(({g,i})=>`<tr data-i="${i}"><td>'${g.s} ${g.w.replace("Week ","Wk ")}</td><td>${g.h?"vs":"@"} ${g.o}${g.other||g.early?`<span class="tags">${g.other?`<span class="tag">w/ ${g.t}</span>`:""}${g.early?`<span class="tag warn">limited</span>`:""}</span>`:""}</td><td class="${g.m>0?"w":g.m<0?"l":""}">${g.m==null?"":g.m>0?"W "+g.m:g.m<0?"L "+(-g.m):"T"}</td><td class="v" style="font-weight:500">${g.vol}</td><td class="v">${g.v}</td><td><span class="dot" style="--c:var(--${res(g.v)==="h"?"hit":"miss"})"></span></td></tr>`).join("")}</tbody>
    </table></div>
  </section>`;

  // role & coverage
  const volL=VOLL[S.vol],vl=volL.toLowerCase();
  const vAvg=a=>a.length?+(a.reduce((s,g)=>s+g.vol,0)/a.length).toFixed(1):0;
  const yAvg=a=>{if(!a.length)return 0;const m=a.reduce((s,g)=>s+g.v,0)/a.length;return dec?+m.toFixed(1):Math.round(m)};
  const early=vAvg(gs.slice(-8,-4)),late=vAvg(gs.slice(-4));
  const trend=late-early>=1?"going up":early-late>=1?"going down":"steady";
  const shareTxt=S.vol==="rz"?`${vAvg(gs.filter(g=>g.s==="26"))} red-zone touches a game`:S.vol==="tgt"&&p.share!=null?`Gets ${p.share}% of team targets`:S.vol==="car"&&p.cshare!=null?`Gets ${p.cshare}% of team carries`:`${vAvg(gs.filter(g=>g.s==="26"))} ${vl} a game`;
  const sn=gs.filter(g=>g.s==="26"&&g.snap!=null),snap=p.pos==="QB"||!sn.length?null:Math.round(sn.reduce((s,g)=>s+g.snap,0)/sn.length);
  const last8=gs.slice(-8);
  const vmax=Math.max(...last8.map(g=>g.vol),1)*1.2,VW=640,VH=150,vbw=(VW-20)/last8.length,vy=v=>22+(VH-44)*(1-v/vmax);
  const volChart=`<svg class="chart" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${volL}, last ${last8.length} games">${last8.map((g,i)=>{const x=10+i*vbw+vbw*.2,w=vbw*.6;return `<rect class="vb" x="${x.toFixed(1)}" y="${vy(g.vol).toFixed(1)}" width="${w.toFixed(1)}" height="${(vy(0)-vy(g.vol)).toFixed(1)}" rx="4"/><text class="vlbl" x="${(x+w/2).toFixed(1)}" y="${(vy(g.vol)-6).toFixed(1)}" text-anchor="middle">${g.vol}</text><text class="tick" x="${(x+w/2).toFixed(1)}" y="${VH-4}" text-anchor="middle">${g.o}</text>`}).join("")}</svg>`;

  const top=tend?tend.mix[0][0]:null;
  let covCard="";
  if(STAT[st.stat].d==="rush"&&p.pos==="RB"){
    const B=p.box;
    covCard=B?(()=>{const rowsB=[["light","Light box (6 or fewer)"],["normal","Normal box (7)"],["stacked","Stacked box (8+)"]].filter(([k])=>B[k]);
      const ypc=k=>+(B[k][1]/B[k][0]).toFixed(1),mx=Math.max(...rowsB.map(([k])=>ypc(k)),1);
      return `<section class="card"><p class="label">Vs. box count (2025)</p>
      <div class="take"><b>${ypc(rowsB.slice().sort((a,b)=>ypc(b[0])-ypc(a[0]))[0][0])} yards a carry at best</b><p>How many defenders were near the line when he ran. Fewer defenders usually means more room.</p></div>
      <div class="splits">${rowsB.map(([k,l])=>`<div class="split"><div class="l">${l}<small>${B[k][0]} carries</small></div><div class="meter" style="--c:var(--accent)"><i style="width:${Math.round(ypc(k)/mx*100)}%"></i></div><div class="r">${ypc(k)}</div></div>`).join("")}</div>
      <p class="hint">Yards per carry, 2025 season.</p></section>`})():`<section class="card"><p class="label">Vs. box count</p><p class="hint">No 2025 charting for him yet (rookie or didn't play).</p></section>`;
  } else if(p.cov){
    const C=p.cov,isQB=p.pos==="QB";
    const keys=COVORDER.filter(k=>C[k]&&C[k][0]>=3);
    const totT=keys.reduce((s,k)=>s+C[k][0],0)||1;
    const ypt=k=>+(C[k][2]/C[k][0]).toFixed(1),cr=k=>Math.round(C[k][1]/C[k][0]*100);
    const allY=+(keys.reduce((s,k)=>s+C[k][2],0)/totT).toFixed(1),allC=Math.round(keys.reduce((s,k)=>s+C[k][1],0)/totT*100);
    const metric=k=>dec&&!isQB?cr(k):ypt(k),mlabel=dec&&!isQB?"catch rate":isQB?"yards per attempt":"yards per target";
    const mx=Math.max(...keys.map(metric),1);
    const T=top&&C[top]&&C[top][0]>=3?top:null;
    const mz=k=>C[k]?`${isQB?+(C[k][2]/C[k][0]).toFixed(1)+" YPA":+(C[k][2]/C[k][0]).toFixed(1)+" yds/tgt"}<small>${Math.round(C[k][1]/C[k][0]*100)}% ${isQB?"completions":"caught"} · ${C[k][0]} ${isQB?"att":"tgt"}</small>`:"—";
    covCard=`<section class="card"><p class="label">Vs. coverage (2025 charting)</p>
      <div class="take"><b>${top?`This week: ${top}`:"Coverage splits"}</b><p>${top?`The ${NAME[nx.opp]} played ${top} on ${tend.mix[0][1]}% of passes in 2025 and man coverage ${tend.man}% of the time. `:""}${T?(isQB?`He averaged ${ypt(T)} yards per attempt against ${T} (${allY} overall).`:dec?`He caught ${cr(T)}% of targets against ${T} (${allC}% overall).`:`He averaged ${ypt(T)} yards per target against ${T} (${allY} overall).`):top?`He didn't see much ${top} in 2025.`:""}</p></div>
      <div class="tiles" style="grid-template-columns:1fr 1fr">
        <div class="tile"><small>vs man</small><b>${mz("MAN")}</b></div>
        <div class="tile"><small>vs zone</small><b>${mz("ZONE")}</b></div>
      </div>
      <div class="splits">${keys.map(k=>`<div class="split${k===top?" this":""}"><div class="l">${k}${k===top?' <span class="chip mid">This week</span>':""}<small>${Math.round(C[k][0]/totT*100)}% of his ${isQB?"throws":"targets"} · ${C[k][0]} ${isQB?"att":"tgt"}${isQB&&C[k][3]?` · ${C[k][3]} INT`:""}</small></div><div class="meter" style="--c:var(--accent)"><i style="width:${Math.round(metric(k)/mx*100)}%"></i></div><div class="r">${dec&&!isQB?cr(k)+"%":ypt(k)}</div></div>`).join("")}</div>
      <p class="hint">${cap(mlabel)} against each coverage, 2025 regular season and playoffs.</p>
      ${isQB&&p.press?`<div class="side"><div class="sh"><span>Under pressure (2025)</span>${O.sackRateRk<=10?`<span class="chip bad">${NAME[nx.opp]} get after the QB</span>`:""}</div>
        <div class="list"><div class="li"><span class="k">Clean pocket</span><span class="v">${(p.press.c[1]/Math.max(p.press.c[0],1)).toFixed(1)} YPA<small>${p.press.c[0]} att</small></span></div>
        <div class="li"><span class="k">Under pressure</span><span class="v">${(p.press.p[1]/Math.max(p.press.p[0],1)).toFixed(1)} YPA<small>${p.press.p[0]} att · ${p.press.p[2]} sacks</small></span></div></div></div>`:""}
    </section>`;
  } else covCard=`<section class="card"><p class="label">Vs. coverage</p><p class="hint">No 2025 coverage charting for him (rookie or didn't play).</p></section>`;

  const mateG=gs.filter(g=>g.mate),norm=gs.filter(g=>!g.mate);
  const mateInj=p.mate&&(INJ[p.team]||[]).find(i=>i.n===p.mate);
  const mateCard=p.mate?`<section class="card">
    <p class="label">When ${esc(p.mate)} didn't play</p>
    ${mateG.length?`<div class="take"><b>${vAvg(mateG)>vAvg(norm)+.4?`More ${vl}`:vAvg(mateG)<vAvg(norm)-.4?`Fewer ${vl}`:"About the same"}</b><p>In ${mateG.length} game${mateG.length===1?"":"s"} without ${esc(p.mate.split(" ")[0])}, he averaged ${vAvg(mateG)} ${vl} and ${yAvg(mateG)} ${unitW}. With him it's ${vAvg(norm)} ${vl} and ${yAvg(norm)} ${unitW}.</p></div>`
      :`<p class="hint">${esc(p.mate)} played in every one of these games, so there's no split yet.</p>`}
    ${mateInj?`<div class="means warn"><p class="label">This week</p><p><b>${esc(p.mate)}</b> is listed as <b>${mateInj.s==="DNP"?"missing practice":mateInj.s.toLowerCase()}</b>${mateInj.i?` (${esc(mateInj.i)})`:""}.${mateG.length?" If he sits, expect usage closer to the numbers above.":""}</p></div>`:""}
  </section>`:"";

  const tdCard=st.stat==="td"||st.stat==="ptd"?(()=>{const s26=gs.filter(g=>g.s==="26"),k=st.stat;
    const tdG=gs.filter(g=>g[k]>0).length,glAvg=s26.length?(s26.reduce((a,g)=>a+g.gl,0)/s26.length).toFixed(1):"0",rzAvg=s26.length?(s26.reduce((a,g)=>a+g.rz,0)/s26.length).toFixed(1):"0";
    const weak=gs.filter(g=>g.tr>=17),strong=gs.filter(g=>g.tr<=16);
    return `<section class="card"><p class="label">Scoring profile</p>
      <div class="take"><b>${k==="td"?`Scored in ${tdG} of ${n} games`:`${(gs.reduce((a,g)=>a+g.ptd,0)/n).toFixed(1)} TD passes a game`}</b><p>The ${NAME[nx.opp]} allow ${O.papg} points a game (${ord(O.papgRk)}).</p></div>
      <div class="list">
        ${k==="td"?`<div class="li"><span class="k">Red-zone touches this season</span><span class="v">${rzAvg}<small>per game</small></span></div>
        <div class="li"><span class="k">Goal-line carries (inside the 5)</span><span class="v">${glAvg}<small>per game</small></span></div>`:""}
        <div class="li"><span class="k">vs bottom-half scoring defenses</span><span class="v">${weak.filter(g=>res(g.v)==="h").length}/${weak.length}<small>hit</small></span></div>
        <div class="li"><span class="k">vs top-half scoring defenses</span><span class="v">${strong.filter(g=>res(g.v)==="h").length}/${strong.length}<small>hit</small></span></div>
      </div></section>`})():"";
  const role=`${tdCard}
  <section class="card">
    <div class="take"><b>${shareTxt}</b><p>His ${vl} are ${trend}: ${early} a game before, ${late} in the last 4.${snap!=null?` He's played ${snap}% of snaps this season.`:""}</p></div>
    <p class="label">${volL}, last ${last8.length} games</p>
    ${volChart}
  </section>${covCard}${mateCard}`;

  const TABS=[["tape",`Last ${n}`],["role","Role & coverage"],["next","Up next"],["flow","Game flow"],["splits","Splits"],["log","Game log"]];
  const nav=`<nav class="tabs" role="tablist">${TABS.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${k===st.tab}">${l}</button>`).join("")}</nav>`;
  const askKey=`p:${p.id}:${st.stat}:${st.side}:${st.line}`;
  document.getElementById("out").innerHTML=summary+nav+{tape,role,next,flow,splits,log}[st.tab]+askBox(askKey,`Ask about ${p.name} ${LT} ${S.long}.`,["Is this a good bet this week?","What's the biggest risk?","How does the matchup look?"]);
}

function select(i){st.sel=i;const gs=games(P(),st.stat);document.getElementById("chartwrap").innerHTML=chart(gs);document.getElementById("game").outerHTML=gameCard(gs[i])}
function full(){renderControls();render()}

// ============ GAMES ============
const outlook=ad=>ad<=3.5?['Close game','mid']:ad<=7?['Slight edge','neu']:['Blowout watch','bad'];
const keyOut=t=>(INJ[t]||[]).filter(i=>i.k&&["Out","Doubtful","DNP"].includes(i.s));
function favDog(g){const homeFav=g.pHome>=.5,pj=projOf(g);
  return {fav:homeFav?g.home:g.away,dog:homeFav?g.away:g.home,pct:Math.round((homeFav?g.pHome:1-g.pHome)*100),ad:Math.abs(g.spread),pj}}
const STATUS={Out:["Out","bad"],Doubtful:["Doubtful","bad"],Questionable:["Questionable","mid"],DNP:["Missed practice","bad"],Limited:["Limited practice","mid"]};

function gameRow(g){
  const fd=favDog(g),ol=outlook(fd.ad),A=TR[g.away],H=TR[g.home];
  const aP=Math.round((1-g.pHome)*100),hP=100-aP,k=keyOut(g.away).length+keyOut(g.home).length,W=wxInfo(g);
  const fin=g.final,lv=!fin&&liveChip(g)?g.live:null;
  return `<button class="grow" data-game="${g.id}">
    <div class="gmeta"><span>${fmtTime(g.time)}${g.stadium.includes("Tottenham")?" · London":""}</span>${fin?`<span class="chip neu">Final</span>`:liveChip(g)||`<span class="chip ${ol[1]}">${ol[0]}</span>`}</div>
    <div class="gteams">
      <div class="gt"><b>${g.away}</b><span>${NAME[g.away]}</span><small>${A.w}-${A.l}${A.t?"-"+A.t:""}</small></div><div class="gp ${fin?(fin[0]>fin[1]?"fav":""):lv?(lv.as>=lv.hs?"fav":""):fd.fav===g.away?"fav":""}">${fin?fin[0]:lv?lv.as:aP+"%"}</div>
      <div class="gt"><b>${g.home}</b><span>${NAME[g.home]}</span><small>${H.w}-${H.l}${H.t?"-"+H.t:""}</small></div><div class="gp ${fin?(fin[1]>fin[0]?"fav":""):lv?(lv.hs>=lv.as?"fav":""):fd.fav===g.home?"fav":""}">${fin?fin[1]:lv?lv.hs:hP+"%"}</div>
    </div>
    ${fin?"":`<div class="wbar" aria-hidden="true"><i class="${fd.fav===g.away?"fav":""}" style="width:${aP}%"></i><i class="${fd.fav===g.home?"fav":""}" style="width:${hP}%"></i></div>`}
    <div class="gfoot"><span>${fin?`${fin[0]>fin[1]?g.away:g.home} won${(fin[0]>fin[1])!==(fd.fav===g.away)?" (upset)":""}`:`Line: <b>${fd.fav} −${fmt(fd.ad)}</b> · Total ${fmt(g.total)}`}</span>${fin?"":`<span class="chip ${W.chip[1]}">${W.chip[0]}</span>`}${!fin&&k?`<span class="inj-n">${k} key player${k===1?"":"s"} hurt</span>`:""}</div>
  </button>`;
}

function gameList(){
  const up=W5.filter(g=>!g.final),close=up.filter(g=>Math.abs(g.spread)<=3.5).length,blow=up.filter(g=>Math.abs(g.spread)>7).length;
  const F={live:g=>!g.final&&!!liveChip(g),all:()=>true,close:g=>!g.final&&Math.abs(g.spread)<=3.5,blowout:g=>!g.final&&Math.abs(g.spread)>7,injuries:g=>keyOut(g.away).length+keyOut(g.home).length>0,rain:g=>wxInfo(g).pass<0};
  let lastDay="",rows="";
  W5.filter(F[st.filter]).forEach(g=>{const d=`${g.day} · ${fmtDate(g.date)}`;if(d!==lastDay){rows+=`<p class="day">${d}</p>`;lastDay=d}rows+=gameRow(g)});
  const liveN=W5.filter(g=>!g.final&&liveChip(g)).length;
  return `
  <section class="hero">
    <h1>Who wins this week? <em>And why.</em></h1>
    <p>Every Week ${D.week} game with real betting lines, team stats, this week's injury report and the forecast. Tap a game for the full breakdown.</p>
  </section>
  <div class="take"><b>Week ${D.week} · ${W5.length} games</b><p>${liveN?`<b>${liveN} game${liveN===1?"":"s"} live right now.</b> `:""}${close} look close and ${blow} have a spread over 7 points. On bye: ${D.bye.map(t=>NAME[t]).join(" and ")}.</p></div>
  <div class="filters" role="group" aria-label="Filter games">${[["all","All games"],...(liveN?[["live","Live now"]]:[]),["close","Close games"],["blowout","Blowout watch"],["injuries","Key injuries"],["rain","Rain"]].map(([k,l])=>`<button data-filter="${k}" aria-pressed="${k===st.filter}">${l}</button>`).join("")}</div>
  <div class="glist">${rows||'<p class="hint">No games match this filter.</p>'}</div>`;
}

function reasons(fav,dog,g){
  const F=TR[fav],Dd=TR[dog],out=[];const add=(m,t,p)=>out.push({m,t,p});
  if(Dd.ppgRk-F.ppgRk>=6)add(Dd.ppgRk-F.ppgRk,"Better offense",`The ${NAME[fav]} score ${F.ppg} points a game (${ord(F.ppgRk)} in the NFL). The ${NAME[dog]} score ${Dd.ppg} (${ord(Dd.ppgRk)}).`);
  if(Dd.papgRk-F.papgRk>=6)add(Dd.papgRk-F.papgRk,"Better defense",`The ${NAME[fav]} allow ${F.papg} points a game (${ord(F.papgRk)}). The ${NAME[dog]} allow ${Dd.papg} (${ord(Dd.papgRk)}).`);
  if(F.sackRateRk<=12&&Dd.sackedRateRk>=18)add(Dd.sackedRateRk-F.sackRateRk,"Pass rush advantage",`The ${NAME[fav]} sack the QB on ${F.sackRate}% of dropbacks (${ord(F.sackRateRk)}). The ${NAME[dog]} give up sacks on ${Dd.sackedRate}% (${ord(Dd.sackedRateRk)}).`);
  if(F.passYRk<=12&&Dd.passARk>=18)add(Dd.passARk-F.passYRk,"Passing game advantage",`The ${NAME[fav]} throw for ${F.passY} yards a game (${ord(F.passYRk)}). The ${NAME[dog]} allow ${Dd.passA} (${ord(Dd.passARk)}).`);
  if(F.rushYRk<=12&&Dd.rushARk>=18)add(Dd.rushARk-F.rushYRk,"Run game advantage",`The ${NAME[fav]} run for ${F.rushY} yards a game (${ord(F.rushYRk)}). The ${NAME[dog]} allow ${Dd.rushA} on the ground (${ord(Dd.rushARk)}).`);
  if(Dd.toRk-F.toRk>=8)add((Dd.toRk-F.toRk)*.8,"Turnovers",`The ${NAME[fav]} are ${sgn(F.to)} in turnovers. The ${NAME[dog]} are ${sgn(Dd.to)}.`);
  const ki=keyOut(dog).length-keyOut(fav).length;
  if(ki>=1){const x=keyOut(dog)[0];add(6+ki*3,"Injuries",`The ${NAME[dog]} have ${x.n} (${x.p}) ${x.s==="DNP"?"missing practice":"listed as "+x.s.toLowerCase()} this week${x.i?` with a ${x.i.toLowerCase()} injury`:""}.`)}
  if(F.w-Dd.w>=2)add((F.w-Dd.w)*2.5,"Better record",`The ${NAME[fav]} are ${F.w}-${F.l}${F.t?"-"+F.t:""}. The ${NAME[dog]} are ${Dd.w}-${Dd.l}${Dd.t?"-"+Dd.t:""}.`);
  if(fav===g.home&&!g.stadium.includes("Tottenham"))add(3,"Home field","They're playing at home, which is usually worth a point or two.");
  return out.sort((a,b)=>b.m-a.m);
}

function battleRows(off,def){
  const O=TR[off],Dd=TR[def];
  const rows=[["Passing",O.passYRk,`${off} passing`,Dd.passARk,`${def} pass D`,`${O.passY} yds/gm`,`${Dd.passA} allowed`],
    ["Running",O.rushYRk,`${off} run game`,Dd.rushARk,`${def} run D`,`${O.rushY} yds/gm`,`${Dd.rushA} allowed`],
    ["Protection",O.sackedRateRk,`${off} O-line`,Dd.sackRateRk,`${def} pass rush`,`${O.sackedRate}% sacked`,`${Dd.sackRate}% sacks`]];
  let oe=0,de=0;
  const html=rows.map(([m,or,ol,dr,dl,os,ds])=>{const e=or<dr-3?"o":dr<or-3?"d":"";if(e==="o")oe++;if(e==="d")de++;
    return `<div class="battle"><div class="bl"><b>${ol}</b><small>${word(or)} · ${os} ${e==="o"?'<span class="edge">Edge</span>':""}</small></div><div class="bm">${m}</div><div class="bl r"><b>${dl}</b><small>${e==="d"?'<span class="edge">Edge</span> ':""}${word(dr)} · ${ds}</small></div></div>`}).join("");
  const chip=oe>de?`<span class="chip good">${off} offense has the edge</span>`:de>oe?`<span class="chip bad">${def} defense has the edge</span>`:`<span class="chip neu">Even</span>`;
  return `<div class="side"><div class="sh"><span>When the ${NAME[off]} have the ball</span>${chip}</div><div>${html}</div></div>`;
}
const IMPACT={QB:"Their quarterback. If he can't go, expect a much weaker passing game.",WR:"A receiver. Fewer options in the passing game.",TE:"Tight end. Loses a short-area and red-zone target.",RB:"Running back. More work for the backup.",FB:"Fullback. Minor impact on the run game.",
  T:"Offensive tackle. Pass protection gets weaker.",G:"Guard. Run blocking and inside protection take a hit.",C:"Center. Can affect snaps and protection calls.",OL:"Offensive lineman. Protection takes a hit.",
  DE:"Edge rusher. Less pressure on the other quarterback.",DT:"Defensive tackle. Run defense and inside pressure get weaker.",DL:"Defensive lineman. Less push up front.",LB:"Linebacker. Run defense and coverage over the middle take a hit.",ILB:"Linebacker. Run defense and coverage over the middle take a hit.",OLB:"Edge defender. Less pressure on the other quarterback.",
  CB:"Cornerback. Opposing receivers get easier matchups.",S:"Safety. Harder to stop deep passes.",FS:"Safety. Harder to stop deep passes.",SS:"Safety. Run support and deep help take a hit.",K:"Kicker.",P:"Punter.",LS:"Long snapper."};
const streak=t=>{const l=D.form[t].map(x=>x.m>0?"W":x.m<0?"L":"T");let n=1;for(let i=l.length-2;i>=0&&l[i]===l[l.length-1];i--)n++;return {k:l[l.length-1],n}};

function gameDetail(id){
  const g=W5.find(x=>x.id===id),A=TR[g.away],H=TR[g.home],fd=favDog(g),ol=outlook(fd.ad),pj=fd.pj,fin=g.final;
  const aP=Math.round((1-g.pHome)*100),hP=100-aP;
  const rec=t=>`${TR[t].w}-${TR[t].l}${TR[t].t?"-"+TR[t].t:""}`;
  const head=`
  <button class="back" data-back>← All games</button>
  <section class="card">
    <p class="label">Week ${D.week} · ${g.day} ${fmtDate(g.date)} · ${fmtTime(g.time)} · ${esc(g.stadium)}</p>${!fin&&liveChip(g)?`<div>${liveChip(g)}</div>`:""}
    <div class="mhead">
      <div class="mteam"><b>${g.away}</b><span>${NAME[g.away]}</span><small>${rec(g.away)}</small></div>
      <div class="mat">${fin?`${fin[0]}–${fin[1]}`:liveChip(g)?`${g.live.as}–${g.live.hs}`:"@"}</div>
      <div class="mteam" style="text-align:right"><b>${g.home}</b><span>${NAME[g.home]}</span><small>${rec(g.home)}</small></div>
    </div>
    <div class="wbar" aria-hidden="true" style="height:10px"><i class="${fd.fav===g.away?"fav":""}" style="width:${aP}%"></i><i class="${fd.fav===g.home?"fav":""}" style="width:${hP}%"></i></div>
    <div class="wlabels"><span>${aP}% to win</span><span>${hP}% to win</span></div>
    <p class="hint" style="margin-top:-8px">Win chances come from the betting odds${fin?" before kickoff":""}.</p>
  </section>`;

  const rs=reasons(fd.fav,fd.dog,g).slice(0,3);
  if(!rs.length)rs.push({t:"Slightly better on paper",p:`No single big edge in the stats. The betting market still leans ${NAME[fd.fav]}.`});
  const up=reasons(fd.dog,fd.fav,g)[0];
  const players=PLAYERS.filter(p=>p.team===g.away||p.team===g.home).sort((a,b)=>(a.team===g.away?0:1)-(b.team===g.away?0:1)||"QBRBWRTE".indexOf(a.pos)-"QBRBWRTE".indexOf(b.pos));
  const pick=`
  <section class="card">
    ${fin?`<div class="take"><b>Final: ${NAME[fin[0]>fin[1]?g.away:g.home]} won ${Math.max(...fin)}–${Math.min(...fin)}</b><p>${(fin[0]>fin[1])!==(fd.fav===g.away)?`That was an upset. The ${NAME[fd.fav]} were favored by ${fmt(fd.ad)}.`:`The favorite won. The ${NAME[fd.fav]} were favored by ${fmt(fd.ad)}.`}</p></div>`:
    `<div class="take"><b>${fd.ad<=3.5?`Toss-up, lean ${NAME[fd.fav]}`:`${NAME[fd.fav]} should win`}</b><p>The betting odds give them a ${fd.pct}% chance. Spread: ${fd.fav} −${fmt(fd.ad)}. Total: ${fmt(g.total)}. <span class="chip ${ol[1]}">${ol[0]}</span></p></div>
    <div class="proj">
      <div class="pteam"><small>${g.away}</small><b>${Math.round(pj.a)}</b></div>
      <div class="pmid"><b>${fd.fav} by ${fmt(fd.ad)}</b>From betting lines</div>
      <div class="pteam" style="text-align:right"><small>${g.home}</small><b>${Math.round(pj.h)}</b></div>
    </div>`}
    <p class="label">Why the ${NAME[fd.fav]} ${fin?"were favored":"are favored"}</p>
    <ul class="reasons">${rs.map((r,k)=>`<li><span class="n">${k+1}</span><div><b>${r.t}</b><p>${esc(r.p)}</p></div></li>`).join("")}</ul>
    <div class="means warn"><p class="label">Upset watch</p><p>${up?`<b>${up.t}.</b> ${esc(up.p.replace(/^They're/,`The ${NAME[fd.dog]} are`))}`:`Hard to find a stat edge for the ${NAME[fd.dog]}. They'd need turnovers or big plays.`}</p></div>
    ${fin?"":`<p class="label">Add to your slip</p>
    <div class="btnrow">${[g.away,g.home].map(t=>{const l={type:"team",game:g.id,team:t};return `<button class="${inSlip(l)?"addbtn in":"ghost"}" data-addteam="${g.id}:${t}">${inSlip(l)?"✓ ":"+ "}${NAME[t]} to win</button>`}).join("")}</div>`}
    <p class="label">Look up a player</p>
    <div class="examples">${players.map(p=>`<button data-player="${p.id}">${esc(p.name)} · ${p.team} ${p.pos}</button>`).join("")}</div>
    <p class="hint">Stats are from this season's games so far.</p>
  </section>`;

  const all=[[g.away,g.home],[g.home,g.away]].flatMap(([o,d])=>[["passing",TR[o].passYRk,"pass defense",TR[d].passARk,o,d],["run game",TR[o].rushYRk,"run defense",TR[d].rushARk,o,d],["offensive line",TR[o].sackedRateRk,"pass rush",TR[d].sackRateRk,o,d]]);
  const big=all.map(x=>({x,gap:Math.abs(x[1]-x[3])})).sort((a,b)=>b.gap-a.gap)[0].x,offWins=big[1]<big[3];
  const bigTxt=`The ${NAME[big[4]]} ${big[0]} ranks ${ord(big[1])}. The ${NAME[big[5]]} ${big[2]} ranks ${ord(big[3])}. ${offWins?`The ${NAME[big[4]]} should move the ball here.`:`The ${NAME[big[5]]} should win this battle.`}`;
  const cmp=(label,av,hv,better,f=v=>v)=>{const e=better(av,hv);return `<div class="battle"><div class="bl"><b>${f(av)}</b><small>${e==="a"?'<span class="edge">Edge</span>':g.away}</small></div><div class="bm">${label}</div><div class="bl r"><b>${f(hv)}</b><small>${e==="h"?'<span class="edge">Edge</span>':g.home}</small></div></div>`};
  const hi=(a,h)=>a>h?"a":h>a?"h":"",lo=(a,h)=>a<h?"a":h<a?"h":"";
  const tA=TEND[g.away],tH=TEND[g.home];
  const matchup=`
  <section class="card">
    <div class="take"><b>Biggest mismatch</b><p>${bigTxt}</p></div>
    ${battleRows(g.away,g.home)}
    ${battleRows(g.home,g.away)}
    <div class="side"><div class="sh"><span>Season numbers</span></div><div>
      ${cmp("Points scored",A.ppg,H.ppg,hi)}
      ${cmp("Points allowed",A.papg,H.papg,lo)}
      ${cmp("Turnovers +/−",A.to,H.to,hi,sgn)}
      ${cmp("Sack rate",A.sackRate,H.sackRate,hi,v=>v+"%")}
    </div></div>
    <div class="side"><div class="sh"><span>How their defenses cover (2025)</span></div><div class="list">
      ${[[g.away,tA],[g.home,tH]].map(([t,x])=>`<div class="li"><span class="k">${NAME[t]}</span><span class="v">${x?`${x.mix[0][0]} most<small>${x.man}% man · ${x.press}% pressure</small>`:"—"}</span></div>`).join("")}
    </div></div>
    <p class="hint">Ranks are out of 32 teams, from this season's games. Coverage is from 2025 charting.</p>
  </section>`;

  const injTeam=t=>{const L=INJ[t]||[],show=L.slice(0,8);
    return `<div><div class="tname"><span>${NAME[t]}</span>${L.length?`<span class="chip ${keyOut(t).length?"bad":"mid"}">${L.length} listed</span>`:`<span class="chip good">Healthy</span>`}</div>
    ${show.length?show.map(x=>`<div class="inj"><div class="ih"><span>${esc(x.n)} · ${x.p}${x.k?' <span class="chip mid">Key player</span>':""}</span><span class="chip ${STATUS[x.s][1]}">${STATUS[x.s][0]}</span></div><p>${x.i?esc(x.i)+". ":""}${IMPACT[x.p]||""}</p></div>`).join(""):`<p class="none">No one on the injury report.</p>`}
    ${L.length>8?`<p class="hint">Plus ${L.length-8} more with smaller roles.</p>`:""}</div>`};
  const ka=keyOut(g.away).length,kh=keyOut(g.home).length;
  const injTake=ka+kh===0?["No key players hurt","None of the main offensive players are missing practice or ruled out."]
    :ka===kh?["Both teams banged up","Each side has key players on the report."]
    :[`Injuries hurt the ${NAME[ka>kh?g.away:g.home]} more`,`${keyOut(ka>kh?g.away:g.home).map(x=>x.n).join(", ")} ${ka+kh>1&&Math.max(ka,kh)>1?"are":"is"} on the report.`];
  const injuries=`
  <section class="card">
    <div class="take"><b>${injTake[0]}</b><p>${esc(injTake[1])}</p></div>
    ${injTeam(g.away)}${injTeam(g.home)}
    <p class="hint">From the official Week ${D.week} injury and practice report as of ${fmtDate(D.asof)}. Final game statuses are set two days before kickoff, so check again closer to the game.</p>
  </section>`;

  const sa=streak(g.away),sh=streak(g.home),hot=[[g.away,sa],[g.home,sh]].sort((x,y)=>y[1].n-x[1].n)[0];
  const formTake=hot[1].n>=3&&hot[1].k!=="T"?[`${NAME[hot[0]]} have ${hot[1].k==="W"?"won":"lost"} ${hot[1].n} straight`,hot[1].k==="W"?"They're rolling right now.":"Something's off. Keep that in mind before backing them."]:["No big streaks","Neither team is on a long hot or cold run."];
  const formTeam=t=>{const T=TR[t],F=D.form[t],s=streak(t),l3=F.slice(-3);return `<div class="side"><div class="sh"><span>${NAME[t]}</span><span class="chip ${T.w>T.l?"good":T.w<T.l?"bad":"neu"}">${rec(t)}</span></div>
    <div class="form5" aria-label="Last 5 games, oldest to newest">${F.map(x=>{const k=x.m>0?"W":x.m<0?"L":"T";return `<i class="${k}" title="'${x.s} Wk ${x.w} ${x.h?"vs":"@"} ${x.o}: ${k} ${x.m>0?"+":""}${x.m}">${k}</i>`}).join("")}</div>
    <div class="list">
      <div class="li"><span class="k">Last 5</span><span class="v" style="font-weight:500;font-size:14px">${F.map(x=>`${x.h?"vs":"@"} ${x.o} ${x.m>0?"W":x.m<0?"L":"T"}`).join(", ")}</span></div>
      <div class="li"><span class="k">Streak</span><span class="v">${s.k==="W"?"Won":s.k==="L"?"Lost":"Tied"} ${s.n}</span></div>
      <div class="li"><span class="k">Points, last 3 games</span><span class="v">${(l3.reduce((a,x)=>a+x.pf,0)/l3.length).toFixed(1)}<small>per game</small></span></div>
      <div class="li"><span class="k">Turnovers +/−</span><span class="v">${sgn(T.to)}</span></div>
    </div></div>`};
  const form=`
  <section class="card">
    <div class="take"><b>${formTake[0]}</b><p>${formTake[1]}</p></div>
    ${formTeam(g.away)}${formTeam(g.home)}
    <div class="side"><div class="sh"><span>Last meetings</span>${g.meet&&g.meet.length?`<span class="chip neu">${g.meet.filter(x=>(x.away===g.away?x.as_>x.hs:x.hs>x.as_)).length}-${g.meet.filter(x=>(x.away===g.away?x.as_<x.hs:x.hs<x.as_)).length} ${g.away}</span>`:""}</div>
      ${g.meet&&g.meet.length?`<div class="list">${g.meet.slice().reverse().map(x=>{const w=x.as_>x.hs?x.away:x.hs>x.as_?x.home:null;return `<div class="li"><span class="k">${x.s} ${x.gt==="REG"?"Wk "+x.w:{WC:"Wild Card",DIV:"Divisional",CON:"Conf. title",SB:"Super Bowl"}[x.gt]||"Playoffs"} · ${x.away} @ ${x.home}</span><span class="v">${x.away} ${x.as_}, ${x.home} ${x.hs}${w?`<small>${w} won</small>`:"<small>Tie</small>"}</span></div>`}).join("")}</div>`:`<p class="hint">These teams haven't met since 2015.</p>`}
    </div>
    <p class="hint">Last 5 games, oldest on the left. Can include the end of 2025. Meetings go back to 2015.</p>
  </section>`;

  const W=wxInfo(g),w=g.wx;
  const weather=`
  <section class="card">
    <div class="take"><b>${W.head}</b><p>${esc(W.eff)}</p></div>
    <div class="list">
      <div class="li"><span class="k">Stadium</span><span class="v">${esc(g.stadium)}</span></div>
      <div class="li"><span class="k">Roof</span><span class="v">${w&&w[0]==="in"?"Closed or indoors":"Open air"}</span></div>
      <div class="li"><span class="k">Surface</span><span class="v">${g.surface?cap(g.surface.replace("matrixturf","artificial turf").replace("fieldturf","artificial turf").replace("a_turf","artificial turf").replace("sportturf","artificial turf")):"—"}</span></div>
      ${w&&w[0]==="out"?`<div class="li"><span class="k">Temperature</span><span class="v">${w[1]}°F</span></div><div class="li"><span class="k">Chance of rain</span><span class="v">${w[2]}%</span></div>`:""}
    </div>
    <p class="label">What it means for props</p>
    <div class="list">${W.pass<0?`
      <div class="li"><span class="k">Passing and receiving overs</span><span class="v"><span class="chip bad">Harder</span></span></div>
      <div class="li"><span class="k">Rushing overs</span><span class="v"><span class="chip good">Small boost</span></span></div>
      <div class="li"><span class="k">Total points</span><span class="v"><span class="chip mid">Leans lower</span></span></div>`:`
      <div class="li"><span class="k">All props</span><span class="v"><span class="chip neu">No change</span></span></div>`}
    </div>
    <p class="hint">Forecast from RotoWire as of ${fmtDate(D.asof)}. Forecasts change, so check again on game day.</p>
  </section>`;

  const TABS=[["pick","The pick"],["matchup","Matchup"],["injuries","Injuries"],["form","Form"],["weather","Weather"]];
  const nav=`<nav class="tabs" role="tablist">${TABS.map(([k,l])=>`<button role="tab" data-gtab="${k}" aria-selected="${k===st.gtab}">${l}</button>`).join("")}</nav>`;
  return head+nav+{pick,matchup,injuries,form,weather}[st.gtab]+askBox("g:"+g.id,`Ask about ${NAME[g.away]} at ${NAME[g.home]}.`,["Who wins and why?","Is there upset potential?","Which injuries matter most?"]);
}
function renderGames(){document.getElementById("gamesView").innerHTML=st.game===null?gameList():gameDetail(st.game)}

// ============ MY PICKS ============
const KEY="filmroom.real.v1";
const book=(()=>{try{const b=JSON.parse(localStorage.getItem(KEY));if(b&&Array.isArray(b.slip)&&Array.isArray(b.picks))return b}catch(e){}return {slip:[],picks:[]}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(book))}catch(e){}};
const legKey=l=>l.type==="prop"?`p:${l.pid}:${l.stat}:${l.side}:${l.line}`:`t:${l.game}:${l.team}`;
const inSlip=l=>book.slip.some(x=>legKey(x)===legKey(l));
const curLeg=()=>({type:"prop",pid:st.pid,stat:st.stat,side:st.side,line:st.line});
function hitCount(p,stat,side,line){const gs=games(p,stat);return [gs.filter(g=>side==="over"?g.v>line:g.v<line).length,gs.length]}
function flowFor(p,stat){const nx=nextOf(p.team),pj=projOf(nx.g),us=nx.home?pj.h:pj.a,them=nx.home?pj.a:pj.h,sp=us-them,ad=Math.abs(sp);
  const sc=ad<=3.5?"close":sp>0?"lead":"trail",passy=STAT[stat].d==="pass";return sc==="close"?null:(passy?sc==="trail":sc==="lead")}
function legInfo(l){
  if(l.type==="prop"){const p=PLAYERS.find(x=>x.id===l.pid);if(!p)return null;const [h,n]=hitCount(p,l.stat,l.side,l.line),nx=nextOf(p.team);
    return {p,team:p.team,game:nx.gid,prob:h/n,kind:"Prop",title:`${p.name} ${lineTxt(l.stat,l.side,l.line)} ${STAT[l.stat].long}`,short:`${p.name} ${lineTxt(l.stat,l.side,l.line)}`,sub:`${nx.home?"vs":"@"} ${nx.opp} · hit ${h} of last ${n}`,num:`${h}/${n}`}}
  const g=W5.find(x=>x.id===l.game);if(!g)return null;const pc=Math.round((l.team===g.home?g.pHome:1-g.pHome)*100),opp=l.team===g.home?g.away:g.home;
  return {team:l.team,game:l.game,prob:pc/100,kind:"Game",title:`${NAME[l.team]} to win`,short:`${NAME[l.team]} to win`,sub:`${l.team===g.home?"vs":"@"} ${opp} · ${g.day} ${fmtTime(g.time)}`,num:`${pc}%`}}
function slipChecks(legs,I){
  const out=[];
  for(let a=0;a<legs.length;a++)for(let b=a+1;b<legs.length;b++){
    const x=legs[a],y=legs[b],X=I[a],Y=I[b];if(X.game!==Y.game)continue;
    if(x.type==="team"&&y.type==="team"){if(x.team!==y.team)out.push(["bad","You picked both teams to win the same game. Only one can."]);continue}
    if(x.type==="prop"&&y.type==="prop"){if(X.team!==Y.team)continue;
      const k=[[x,X],[y,Y]],qb=k.find(([l])=>l.stat==="pass"),rc=k.find(([l])=>l.stat==="rec"||l.stat==="recs"),ru=k.find(([l,L])=>l.stat==="rush"&&L.p.pos==="RB");
      if(qb&&rc)out.push(qb[0].side===rc[0].side?["good",`${qb[1].p.name} and ${rc[1].p.name} go together. When he throws more, his receivers catch more.`]:["bad",`${qb[1].p.name} and ${rc[1].p.name} pull against each other. If one hits, the other gets harder.`]);
      else if(qb&&ru&&qb[0].side==="over"&&ru[0].side==="over")out.push(["mid",`${qb[1].p.name} and ${ru[1].p.name} both going over usually needs a high-scoring game. Teams tend to lean on one or the other.`]);
      continue}
    const [t,T]=x.type==="team"?[x,X]:[y,Y],[pr,PR]=x.type==="team"?[y,Y]:[x,X];
    if(pr.side!=="over")continue;
    const same=PR.team===t.team,rush=pr.stat==="rush",nm=PR.p.name;
    if(same&&rush)out.push(["good",`Picking the ${NAME[t.team]} to win fits ${poss(nm)} rushing over. Teams with a lead run more.`]);
    else if(same)out.push(["mid",`If the ${NAME[t.team]} win big, they may stop throwing late. That can cap ${poss(nm)} numbers.`]);
    else if(!rush)out.push(["good",`If the ${NAME[t.team]} win, ${poss(nm)} team is likely throwing to catch up. That helps his over.`]);
    else out.push(["bad",`If the ${NAME[t.team]} win, ${poss(nm)} team may fall behind and stop running. These pull against each other.`]);
  }
  legs.forEach((l,k)=>{const L=I[k];if(l.type!=="prop")return;
    const inj=(INJ[L.team]||[]).find(i=>i.n===L.p.name);if(inj)out.push([inj.s==="Questionable"||inj.s==="Limited"?"mid":"bad",`${L.p.name} is on the injury report (${STATUS[inj.s][0].toLowerCase()}${inj.i?", "+inj.i.toLowerCase():""}).`]);
    const f=flowFor(L.p,l.stat);if(f!==null&&f!==(l.side==="over"))out.push(["bad",`${L.short}: the projected game flow is a bad sign for this pick.`]);
    const W=wxInfo(nextOf(L.team).w5);if(W.pass<0&&STAT[l.stat].d==="pass"&&l.side==="over")out.push(["bad",`${L.short}: ${W.short} could hurt the passing game.`]);
    if(L.prob<.45)out.push(["mid",`${L.short} has hit less than half the time recently.`])});
  const seen=new Set();return out.filter(([c,t])=>!seen.has(t)&&seen.add(t));
}
// ---- odds math ----
const toDec=am=>am>0?1+am/100:1+100/(-am);
const toAm=dec=>{if(!isFinite(dec)||dec<=1)return null;return dec>=2?Math.round((dec-1)*100):-Math.round(100/(dec-1))};
const amTxt=am=>am==null?"—":(am>0?"+":"−")+Math.abs(am);
const money=v=>(v<0?"−$":"$")+Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const parseAm=v=>{const n=parseInt(String(v).replace(/[^\d-]/g,""),10);return isFinite(n)&&Math.abs(n)>=100?n:null};
function bookOdds(l){if(l.odds!=null)return l.odds;if(l.type==="team"){const g=W5.find(x=>x.id===l.game);const ml=g&&(l.team===g.home?g.hml:g.aml);const n=parseAm(ml);if(n!=null)return n}return -110}
function chance(l,L){ // smoothed so small samples never read 0% or 100%
  if(l.type==="team")return L.prob;const [h,n]=hitCount(L.p,l.stat,l.side,l.line);return (h+1)/(n+2)}
function slipMath(legs,I){
  const ps=legs.map((l,k)=>chance(l,I[k])),odds=legs.map(bookOdds);
  const p=ps.reduce((a,x)=>a*x,1),dec=odds.reduce((a,o)=>a*toDec(o),1);
  const stake=Math.max(0,+book.stake||0),payout=stake*dec,ev=p*payout-stake;
  return {ps,odds,p,dec,bookAm:toAm(dec),fairAm:toAm(1/p),stake,payout,profit:payout-stake,ev,implied:1/dec};
}
const rec=a=>{const w=a.filter(p=>p.status==="won").length,l=a.filter(p=>p.status==="lost").length;return {w,l,txt:`${w}-${l}`,pct:w+l?Math.round(w/(w+l)*100):0}};
const pnl=pk=>pk.stake==null?0:pk.status==="won"?pk.stake*((pk.decWon||pk.dec)-1):pk.status==="lost"?-pk.stake:0;
const icon={good:"✓",bad:"!",mid:"~"};
function renderPicks(){
  book.slip=book.slip.filter(l=>legInfo(l));settlePicks();
  if(book.stake==null)book.stake=10;
  const legs=book.slip,I=legs.map(legInfo),n=legs.length,checks=n?slipChecks(legs,I):[];
  const M=n?slipMath(legs,I):null,edge=M?M.p-M.implied:0;
  const corr=checks.some(c=>/go together|fits/.test(c[1]))?"Some of these picks tend to hit together, so the real chance is a bit higher than shown.":checks.some(c=>/pull against|Only one can/.test(c[1]))?"Some of these picks work against each other, so the real chance is lower than shown.":"";
  const slip=n?`
  <section class="card">
    <p class="label">Bet slip · ${n===1?"single":n+"-leg parlay"}</p>
    <div class="calc">
      <div class="cbig"><small>Chance ${n===1?"it hits":"all "+n+" hit"}</small><b style="color:${colorVar(Math.round(M.p*100))}">${(M.p*100).toFixed(M.p<.1?1:0)}%</b><small>Fair odds ${amTxt(M.fairAm)}</small></div>
      <div class="cpay">
        <label for="stake">Bet</label>
        <div class="stakein"><span>$</span><input id="stake" type="number" inputmode="decimal" min="0" step="1" value="${M.stake}"></div>
        <div class="paygrid">
          <div><small>Book odds</small><b>${amTxt(M.bookAm)}</b></div>
          <div><small>To win</small><b>${money(M.profit)}</b></div>
          <div><small>Total payout</small><b>${money(M.payout)}</b></div>
        </div>
      </div>
    </div>
    <div class="means ${M.ev>=0?"":"warn"}"><p class="label">${Math.abs(M.ev)<=M.stake*.03?"Fair price":M.ev>0?"Value bet":"No edge"}</p><p>${Math.abs(M.ev)<=M.stake*.03?`Our numbers (${(M.p*100).toFixed(0)}%) and the book's odds (${(M.implied*100).toFixed(0)}% to break even) basically agree. No real edge either way.`:M.ev>=0
      ?`Our numbers give this a ${(M.p*100).toFixed(0)}% chance. The book's odds only need ${(M.implied*100).toFixed(0)}% to break even. Over time a ${money(M.stake)} bet like this averages about <b>+${money(M.ev).replace("$","$")}</b>.`
      :`The book's odds need ${(M.implied*100).toFixed(0)}% to break even, but our numbers say ${(M.p*100).toFixed(0)}%. Over time a ${money(M.stake)} bet like this averages about <b>${money(M.ev)}</b>.`}${corr?" "+corr:""}</p></div>
    <div>${legs.map((l,k)=>{const pk=M.ps[k],o=M.odds[k],imp=1/toDec(o),val=pk>imp+.02;return `<div class="leg"><div><b>${esc(I[k].title)}</b><small>${I[k].kind} · ${I[k].sub}</small>
      <small class="legmath">Chance <b>${Math.round(pk*100)}%</b> · fair ${amTxt(toAm(1/pk))} · <label>book <input class="oddsin" data-odds="${k}" type="text" inputmode="numeric" value="${amTxt(o).replace("−","-")}" aria-label="Sportsbook odds"></label> ${val?'<span class="chip good">Value</span>':pk<imp-.02?'<span class="chip bad">Pricey</span>':""}</small>
      ${liveLine(legLive(l))}</div><div class="pr"><button class="rm" data-rmleg="${k}" aria-label="Remove from slip">×</button></div></div>`}).join("")}</div>
    <p class="hint">Type your sportsbook's odds for each pick (like -115 or +140). Props start at -110 and teams at the posted moneyline. Chances come from recent hit rates and betting odds. They're estimates, not guarantees.</p>
    <p class="label">Checks</p>
    <div>${(checks.length?checks:[["good","No conflicts found between these picks."]]).map(([c,t])=>`<div class="check"><span class="ic ${c}">${icon[c]}</span><p>${esc(t)}</p></div>`).join("")}</div>
    <div class="btnrow"><button class="primary" data-log>Log ${n===1?"this bet":"this parlay"} · ${money(M.stake)}</button><button class="ghost" data-clear>Clear slip</button></div>
  </section>`:`
  <section class="card empty">
    <p class="label">Bet slip</p>
    <div class="take" style="align-self:stretch"><b>Your slip is empty</b><p>Add player props or teams. You'll see the chance they hit, fair odds, and what a bet would pay.</p></div>
    <div class="btnrow"><button class="ghost" data-mode="spots">See best spots</button><button class="ghost" data-mode="props">Browse props</button><button class="ghost" data-mode="games">Browse games</button></div>
  </section>`;
  const list=book.picks,R=rec(list),pending=list.filter(p=>p.status==="pending").length;
  const staked=list.filter(p=>p.stake!=null&&(p.status==="won"||p.status==="lost")),profit=staked.reduce((a,p)=>a+pnl(p),0),risked=staked.reduce((a,p)=>a+p.stake,0);
  const strong=rec(list.filter(p=>p.prob>=.6)),weak=rec(list.filter(p=>p.prob<.6));
  const tracker=`
  <section class="card">
    <p class="label">Pick tracker</p>
    ${list.length?`
    <div class="score"><div class="big">${R.w}<span>-${R.l}</span></div><p>${R.w+R.l?`You've hit <b>${R.pct}%</b> of your settled bets.`:"No settled bets yet."}${pending?` ${pending} still pending.`:""}</p></div>
    <div class="tiles">
      <div class="tile"><small>Profit</small><b style="color:${profit>=0?"var(--hit)":"var(--miss)"}">${profit>=0?"+":""}${money(profit)}</b></div>
      <div class="tile"><small>Return</small><b>${risked?(profit>=0?"+":"")+Math.round(profit/risked*100)+"%":"—"}</b></div>
      <div class="tile"><small>Pending</small><b>${pending}</b></div>
    </div>
    ${strong.w+strong.l&&weak.w+weak.l?`<div class="means"><p class="label">What's working</p><p>When the numbers said 60% or better, you went <b>${strong.txt}</b>. On the rest you went <b>${weak.txt}</b>.</p></div>`:""}
    <div>${list.map(p=>{const legsL=p.legs||(p.leg?[p.leg]:[]),lv=p.status==="pending"&&legsL.length?(legsL.length===1?liveLine(legLive(legsL[0])):parlayLine(legsL)):p.auto?`<small class="lv ${p.status}">${esc(p.auto)} · settled automatically</small>`:"";
      return `<div class="pick"><div><b>${esc(p.title)}</b><small>${p.kind} · ${esc(p.sub)}${p.stake!=null?` · ${money(p.stake)} at ${amTxt(toAm(p.dec))}`:""}${p.status==="won"&&p.stake!=null?` · <span style="color:var(--hit)">+${money(pnl(p))}</span>`:p.status==="lost"&&p.stake!=null?` · <span style="color:var(--miss)">${money(pnl(p))}</span>`:""}</small>${lv}</div><div class="acts">${
      p.status==="pending"?`<button class="s w" data-settle="${p.id}:won">Won</button><button class="s l" data-settle="${p.id}:lost">Lost</button>`:`<span class="chip ${p.status==="won"?"good":p.status==="void"?"neu":"bad"}">${p.status}</span>`}<button class="rm" data-del="${p.id}" aria-label="Delete pick">×</button></div></div>`}).join("")}</div>`
    :`<div class="take"><b>No bets logged yet</b><p>Log a bet from your slip. Picks settle themselves after the games, and your record, profit and return build here.</p></div>`}
    <p class="hint">Saved in this browser only. This is a tracker, not a sportsbook. No real money moves here.</p>
  </section>`;
  document.getElementById("picksView").innerHTML=slip+tracker;
}
function parlayLine(legs){const rs=legs.map(legLive),won=rs.filter(r=>r&&r.state==="won").length,live=rs.filter(r=>r&&r.state==="live").length,lost=rs.filter(r=>r&&r.state==="lost").length;
  if(!won&&!live&&!lost)return "";return `<small class="lv ${lost?"lost":live?"live":"won"}">${live?'<span class="livedot"></span>':""}${won} of ${legs.length} legs hit${live?` · ${live} live`:""}${lost?` · ${lost} missed`:""}</small>`}
let toastT;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,1800)}
function updateCount(){document.getElementById("picksBtn").innerHTML=`My picks${book.slip.length?`<span class="cnt">${book.slip.length}</span>`:""}`}
function toggleLeg(l){const k=legKey(l),i=book.slip.findIndex(x=>legKey(x)===k);
  if(i>=0){book.slip.splice(i,1);toast("Removed from slip")}else{book.slip.push(l);toast(`Added to slip · ${book.slip.length} pick${book.slip.length===1?"":"s"}`)}
  save();updateCount()}

// ============ BEST SPOTS ============
function propSignals(p,stat,side,line){
  const S=STAT[stat],gs=games(p,stat);if(gs.length<5)return null;
  const nx=nextOf(p.team);if(!nx||!nx.w5||nx.w5.final||(nx.w5.live&&nx.w5.live.status!=="scheduled"))return null;
  const inj=(INJ[p.team]||[]).find(i=>i.n===p.name);if(inj&&["Out","Doubtful"].includes(inj.s))return null;
  const hitAt=g=>side==="over"?g.v>line:g.v<line,l10=gs.slice(-10),h10=l10.filter(hitAt).length,r10=h10/l10.length;
  const O=TR[nx.opp],rk=O[TEAMRK[S.rk][0]],dw=dWord(stat),over=side==="over";
  const sig=[];let score=0;const add=(v,good,txt)=>{score+=v;sig.push([good,txt])};
  if(r10>=.7)add(2,1,`Hit ${h10} of last ${l10.length}`);else if(r10>=.6)add(1,1,`Hit ${h10} of last ${l10.length}`);else if(r10<=.4)add(-2,0,`Hit ${h10} of last ${l10.length}`);
  if(over?rk>=21:rk<=10)add(2,1,`${over?"Soft":"Tough"} ${dw} (${ord(rk)})`);else if(over?rk<=10:rk>=23)add(-2,0,`${over?"Tough":"Soft"} ${dw} (${ord(rk)})`);
  const f=flowFor(p,stat);if(f!==null){if(f===over)add(1,1,"Game flow helps");else add(-1,0,"Game flow hurts")}
  const W=wxInfo(nx.w5);if(W.pass<0&&S.d==="pass"&&stat!=="td")add(over?-1:1,over?0:1,"Rain expected");
  if(inj)add(-2,0,inj.s==="DNP"?"Missed practice":inj.s+" ("+(inj.i||"injury").toLowerCase()+")");
  const tend=TEND[nx.opp];
  if(p.cov&&tend&&S.d==="pass"&&!["td","ptd"].includes(stat)){const top=tend.mix[0][0],C=p.cov,keys=COVORDER.filter(k=>C[k]&&C[k][0]>=3),tot=keys.reduce((a,k)=>a+C[k][0],0);
    if(C[top]&&C[top][0]>=8&&tot){const all=keys.reduce((a,k)=>a+C[k][2],0)/tot,mine=C[top][2]/C[top][0];
      if(mine>=all*1.15)add(over?1:-1,over?1:0,`Strong vs ${top}`);else if(mine<=all*.85)add(over?-1:1,over?0:1,`Weak vs ${top}`)}}
  if(p.mate&&over&&p.pos!=="QB"){const mi=(INJ[p.team]||[]).find(i=>i.n===p.mate);if(mi&&["Out","Doubtful","DNP"].includes(mi.s))add(1,1,`${p.mate} may sit`)}
  if(stat==="td"){const s26=gs.filter(g=>g.s==="26"),gl=s26.reduce((a,g)=>a+g.gl,0)/Math.max(s26.length,1);if(gl>=1)add(1,1,`${gl.toFixed(1)} goal-line carries a game`)}
  if(p.h2hOpp===nx.opp&&p.h2h.length>=2){const hh=p.h2h.filter(g=>over?g[S.f]>line:g[S.f]<line).length;if(hh===p.h2h.length)add(1,1,`${hh} for ${hh} vs ${nx.opp} before`);else if(hh===0)add(-1,0,`0 for ${p.h2h.length} vs ${nx.opp} before`)}
  return {p,stat,side,line,score,sig,h10,n10:l10.length,nx};
}
function computeSpots(){
  const out=[];
  PLAYERS.forEach(p=>{let best=null;
    const MAIN={QB:["pass","rush","ptd"],RB:["rush","recs","td"],WR:["rec","recs","td"],TE:["rec","recs","td"]}[p.pos];
    p.stats.filter(stat=>MAIN.includes(stat)).forEach(stat=>{const line=defLine(p,stat);
      if((stat==="rush"||stat==="rec")&&line<24.5)return;if(stat==="pass"&&line<174.5)return;if(stat==="recs"&&line<2.5)return;
      if(stat==="td"&&p.pos!=="RB"&&games(p,stat).filter(g=>g.td>0).length<6)return;
      const sides=STAT[stat].plus&&stat!=="recs"?["over"]:["over","under"];
      sides.forEach(side=>{const r=propSignals(p,stat,side,line);if(r&&(!best||r.score>best.score))best=r})});
    if(best&&best.score>=3)out.push(best)});
  return out.sort((a,b)=>b.score-a.score||b.h10/b.n10-a.h10/a.n10);
}
function renderSpots(){
  const all=computeSpots(),F={all:()=>true,over:x=>x.side==="over"&&x.stat!=="td",under:x=>x.side==="under",td:x=>x.stat==="td"||x.stat==="ptd"};
  const list=all.filter(F[st.sfilter||"all"]).slice(0,15);
  document.getElementById("spotsView").innerHTML=`
  <section class="hero">
    <h1>Best spots <em>this week.</em></h1>
    <p>Props where the numbers line up: recent hit rate, the matchup, game flow, coverage, head-to-head, injuries and weather. Each uses the player's typical line, so the signals do the work.</p>
  </section>
  <div class="filters" role="group" aria-label="Filter spots">${[["all","All"],["over","Overs"],["under","Unders"],["td","Touchdowns"]].map(([k,l])=>`<button data-sfilter="${k}" aria-pressed="${k===(st.sfilter||"all")}">${l}</button>`).join("")}</div>
  ${list.length?list.map(x=>{const l={type:"prop",pid:x.p.id,stat:x.stat,side:x.side,line:x.line},good=x.sig.filter(s=>s[0]).length;
    return `<section class="card spot">
      <div class="sh"><div><b class="sname">${esc(x.p.name)}</b><small>${x.p.team} ${x.nx.home?"vs":"@"} ${x.nx.opp} · ${x.nx.g.day.slice(0,3)} ${fmtTime(x.nx.g.time)}</small></div><span class="chip good">${good} signal${good===1?"":"s"}</span></div>
      <div class="spotline">${cap(lineTxt(x.stat,x.side,x.line))} ${STAT[x.stat].long}</div>
      <div class="sigs">${x.sig.map(([g,t])=>`<span class="chip ${g?"good":"bad"}">${esc(t)}</span>`).join("")}</div>
      <div class="btnrow"><button class="ghost" data-open="${x.p.id}|${x.stat}|${x.side}|${x.line}">See the research</button><button class="${inSlip(l)?"addbtn in":"addbtn"}" data-spotadd="${x.p.id}|${x.stat}|${x.side}|${x.line}">${inSlip(l)?"✓ In your slip":"+ Add to slip"}</button></div>
    </section>`}).join(""):`<section class="card"><p class="hint">No spots match right now. Games that have started drop off the list.</p></section>`}
  <p class="hint">Signals are a starting point for your own research, not guarantees. Players ruled out or doubtful are left off.</p>`;
}

// ============ ASK FILM ROOM ============
let SAMPLE=null;(async()=>{try{if(window.claude&&window.claude.use)SAMPLE=await window.claude.use("sample")}catch(e){}if(SAMPLE){if(st.mode==="games")renderGames();else if(st.mode==="props")render()}})();
const ASK={};let askCtl=null;
const RULES=`You are Film Room, an NFL research assistant inside a betting research tool. Answer the user's question using ONLY the data provided below. Be direct and plain-spoken, like a sharp friend who watches film: lead with a one-line answer, then 2-4 short supporting points with real numbers from the data. Keep it under 150 words. Never invent stats, injuries or news that are not in the data. If the data can't answer it, say what's missing. You can give a lean, but never promise outcomes, and don't tell anyone to bet more than they can afford. Plain text only; you may use **bold** for the key number.`;
function propContext(){
  const p=P(),S=STAT[st.stat],gs=games(p,st.stat),nx=nextOf(p.team),O=TR[nx.opp],tend=TEND[nx.opp],LT=lineTxt(st.stat,st.side,st.line);
  const hitAt=g=>st.side==="over"?g.v>st.line:g.v<st.line,inj=INJ[p.team]||[],oinj=(INJ[nx.opp]||[]).slice(0,6);
  const sig=propSignals(p,st.stat,st.side,st.line);
  return JSON.stringify({prop:`${p.name} (${p.pos}, ${p.team}) ${LT} ${S.long}`,
    lastGames:gs.map(g=>`'${g.s} ${g.w} ${g.h?"vs":"@"} ${g.o}: ${g.v} (${hitAt(g)?"hit":"miss"}); opp ${dWord(st.stat)} rank ${g.rank}; ${VOLL[S.vol].toLowerCase()} ${g.vol}; result ${g.m>0?"W":"L"} ${g.m}`),
    hitRate:`${gs.filter(hitAt).length} of ${gs.length}`,last5:`${gs.slice(-5).filter(hitAt).length} of 5`,
    nextGame:{opponent:NAME[nx.opp],home:nx.home,kickoff:`${nx.g.day} ${fmtTime(nx.g.time)}`,spread:nx.g.spread,total:nx.g.total,winChance:nx.g.pHome!=null?Math.round((nx.home?nx.g.pHome:1-nx.g.pHome)*100)+"%":null,
      weather:wxInfo(nx.w5).head,oppPassDefRank:O.passARk,oppRunDefRank:O.rushARk,oppPointsAllowedRank:O.papgRk,oppSackRateRank:O.sackRateRk,oppCoverage2025:tend?`${tend.mix.map(m=>m[0]+" "+m[1]+"%").join(", ")}; man ${tend.man}%`:null},
    coverageSplits2025:p.cov?Object.fromEntries(Object.entries(p.cov).filter(([k,v])=>v[0]>=5&&k!=="?").map(([k,v])=>[k,`${v[0]} ${p.pos==="QB"?"att":"tgt"}, ${v[1]} comp, ${v[2]} yds`])):null,
    headToHead:p.h2hOpp===nx.opp?p.h2h.map(g=>`20${g.s} ${g.w}: ${g[S.f]}`):[],
    injuries:{player:(inj.find(i=>i.n===p.name)||{}).s||"healthy",teammates:inj.filter(i=>i.k&&i.n!==p.name).map(i=>`${i.n} ${i.p} ${i.s}`),opponent:oinj.map(i=>`${i.n} ${i.p} ${i.s}`)},
    signals:sig?sig.sig.map(x=>(x[0]?"+ ":"- ")+x[1]):null});
}
function gameContext(id){
  const g=W5.find(x=>x.id===id),A=TR[g.away],H=TR[g.home],fd=favDog(g);
  const team=t=>{const T=TR[t];return {record:`${T.w}-${T.l}${T.t?"-"+T.t:""}`,ppg:T.ppg,ppgRank:T.ppgRk,ptsAllowed:T.papg,ptsAllowedRank:T.papgRk,passOffRank:T.passYRk,rushOffRank:T.rushYRk,passDefRank:T.passARk,rushDefRank:T.rushARk,sackRateRank:T.sackRateRk,sacksAllowedRank:T.sackedRateRk,turnovers:T.to,
    injuries:(INJ[t]||[]).slice(0,8).map(i=>`${i.n} ${i.p} ${i.s}${i.i?" ("+i.i+")":""}`),last5:D.form[t].map(x=>`${x.h?"vs":"@"} ${x.o} ${x.m>0?"W":x.m<0?"L":"T"} ${x.m}`),coverage2025:TEND[t]?`${TEND[t].mix[0][0]} most, ${TEND[t].man}% man`:null}};
  return JSON.stringify({game:`${g.away} @ ${g.home}, Week ${D.week}, ${g.day} ${fmtTime(g.time)}, ${g.stadium}`,status:g.final?`Final ${g.away} ${g.final[0]}-${g.home} ${g.final[1]}`:g.live&&g.live.status!=="scheduled"?`Live ${g.away} ${g.live.as}-${g.home} ${g.live.hs}`:"Not started",
    betting:{favorite:fd.fav,spread:fd.ad,total:g.total,winChanceFavorite:fd.pct+"%"},weather:wxInfo(g).head,[g.away]:team(g.away),[g.home]:team(g.home),
    lastMeetings:(g.meet||[]).map(x=>`${x.s}: ${x.away} ${x.as_}-${x.home} ${x.hs}`)});
}
function askBox(key,title,chips){
  if(!SAMPLE)return "";
  const A=ASK[key]||{turns:[],busy:false};
  return `<section class="card ask" data-askkey="${key}">
    <p class="label">Ask Film Room</p>
    <div class="askthread" id="askthread">${A.turns.length?A.turns.map(t=>t.role==="user"?`<div class="q">${esc(t.content.split("\n\nQUESTION: ").pop())}</div>`:`<div class="a">${fmtAns(t.content)}</div>`).join(""):`<p class="hint">${esc(title)}</p>`}${A.busy?`<div class="a" id="askstream">${A.partial?fmtAns(A.partial):'<span class="hint">Thinking…</span>'}</div>`:""}</div>
    ${A.turns.length||A.busy?"":`<div class="examples">${chips.map(c=>`<button data-askq="${esc(c)}">${esc(c)}</button>`).join("")}</div>`}
    <form class="search askform" autocomplete="off"><input id="askinput" type="text" value="${esc(A.draft||"")}" placeholder="Ask anything about this ${key.startsWith("g:")?"game":"prop"}" aria-label="Ask Film Room">${A.busy?`<button type="button" data-askstop>Stop</button>`:`<button type="submit">Ask</button>`}</form>
    ${A.err?`<p class="note">${esc(A.err)}</p>`:""}
    <p class="hint">Answers use only the numbers on this page and run on your Claude account.</p>
  </section>`;
}
const fmtAns=t=>esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>");
function rerenderAsk(){if(st.mode==="games")renderGames();else render()}
async function askQuestion(key,q){
  if(!SAMPLE||!q.trim())return;const A=ASK[key]=ASK[key]||{turns:[]};if(A.busy)return;
  const ctx=key.startsWith("g:")?gameContext(key.slice(2)):propContext();
  const first=A.turns.length===0;
  const msg=(first?`DATA:\n${ctx}\n\nQUESTION: `:"QUESTION: ")+q.trim();
  A.turns.push({role:"user",content:msg});A.busy=true;A.partial="";A.err="";rerenderAsk();
  askCtl=new AbortController();
  try{const turns=[{role:"user",content:RULES},A.turns[0],...A.turns.slice(1).slice(-6)];
    const {text}=await SAMPLE(turns,{cache:false,signal:askCtl.signal,onText:({text})=>{A.partial=text;const el=document.getElementById("askstream");if(el)el.innerHTML=fmtAns(text)}});
    A.turns.push({role:"assistant",content:text});
  }catch(e){
    if(e&&e.text)A.turns.push({role:"assistant",content:e.text+(e.code==="cancelled"?" …(stopped)":" …(cut off)")});else A.turns.pop();
    const c=e&&e.code;A.err=c==="cancelled"?"":c==="not_granted"||c==="sampling_disabled"?"Ask Film Room needs permission to use Claude. You can allow it the next time you ask.":c==="rate_limited"?"Too many questions at once. Try again in a minute.":c==="session_expired"?"Sign in again to ask.":"Something went wrong. Try asking again.";
    if(c==="not_granted"||c==="sampling_disabled")SAMPLE=null;
  }finally{A.busy=false;A.partial="";rerenderAsk()}
}
document.addEventListener("submit",e=>{const f=e.target.closest(".askform");if(!f)return;e.preventDefault();const key=f.closest("[data-askkey]").dataset.askkey,inp=f.querySelector("#askinput");const q=inp.value;inp.value="";if(ASK[key])ASK[key].draft="";askQuestion(key,q)},true);
document.addEventListener("input",e=>{if(e.target.id!=="askinput")return;const box=e.target.closest("[data-askkey]");if(!box)return;const k=box.dataset.askkey;(ASK[k]=ASK[k]||{turns:[]}).draft=e.target.value});
document.addEventListener("click",e=>{const b=e.target.closest("[data-askq]");if(b){askQuestion(b.closest("[data-askkey]").dataset.askkey,b.dataset.askq);return}
  if(e.target.closest("[data-askstop]")&&askCtl)askCtl.abort()});

// ============ LIVE TRACKING ============
function tdCounts(g){
  const plays=(g.live&&g.live.plays)||[],out={},roster=PLAYERS.filter(p=>p.team===g.away||p.team===g.home);
  const find=ab=>{const m=ab.match(/^([A-Z])\.\s?([A-Za-z'-]+)/);if(!m)return null;const ln=m[2].toLowerCase();
    return roster.find(p=>{const parts=p.name.toLowerCase().replace(/[.]/g,"").split(" ").filter(w=>!/^(jr|sr|ii|iii|iv)$/.test(w));return parts[0][0]===m[1].toLowerCase()&&parts[parts.length-1]===ln})};
  const bump=(p,k)=>{if(p){out[p.id]=out[p.id]||{td:0,ptd:0};out[p.id][k]++}};
  plays.forEach(t=>{if(!/TOUCHDOWN/.test(t)||/TWO-POINT|extra point/i.test(t))return;
    let m=t.match(/([A-Z]\.\s?[A-Za-z'-]+) pass .*?Catch made by ([A-Z]\.\s?[A-Za-z'-]+)/);
    if(m){bump(find(m[1]),"ptd");bump(find(m[2]),"td");return}
    m=t.match(/([A-Z]\.\s?[A-Za-z'-]+) (?:rushed|scrambles|ran)/);if(m)bump(find(m[1]),"td")});
  return out;
}
function legLive(l){
  if(l.type==="team"){const g=W5.find(x=>x.id===l.game);if(!g)return null;const fin=g.final,lv=g.live;
    if(fin){const won=l.team===g.home?fin[1]>fin[0]:fin[0]>fin[1];return {state:won?"won":"lost",txt:`Final: ${g.away} ${fin[0]}, ${g.home} ${fin[1]}`}}
    if(lv&&(lv.status==="inprogress"||lv.status==="halftime")){const my=l.team===g.home?lv.hs:lv.as,th=l.team===g.home?lv.as:lv.hs;
      return {state:"live",txt:`${my>th?"Winning":my<th?"Losing":"Tied"} ${my}–${th}${lv.status==="halftime"?" · Halftime":lv.q?" · Q"+lv.q:""}${lv.clock&&lv.status!=="halftime"?" "+lv.clock:""}`}}
    return null}
  const p=PLAYERS.find(x=>x.id===l.pid);if(!p)return null;const nx=nextOf(p.team),g=nx&&nx.w5;if(!g)return null;
  const S=STAT[l.stat],need=Math.round(l.line+.5),hit=v=>l.side==="over"?v>l.line:v<l.line;
  const off=LIVE.players&&LIVE.players.week===D.week&&LIVE.players.players&&LIVE.players.players[p.id];
  if(off){const v=off[S.f]||0;return {state:hit(v)?"won":"lost",txt:`Final: ${v} ${S.long}`,v,need}}
  const lv=g.live,status=g.final?"closed":lv&&lv.status,q=lv&&lv.q?" · Q"+lv.q:"";
  const teamIn=LIVE.players&&LIVE.players.week===D.week&&Object.keys(LIVE.players.players||{}).some(id=>{const x=PLAYERS.find(pp=>pp.id===id);return x&&x.team===p.team});
  if(status==="closed"&&teamIn)return {state:"void",txt:"He didn't play. Sportsbooks usually void this bet."};
  if(S.unit==="TDs"){const c=(tdCounts(g)[p.id]||{td:0,ptd:0})[l.stat];
    if(status==="inprogress"||status==="halftime"){if(c>=need)return {state:l.side==="over"?"won":"lost",txt:`${c} ${l.stat==="td"?"TD":"TD pass"}${c===1?"":"s"} so far`,v:c,need};return {state:"live",txt:`${c} of ${need} so far${q}`,v:c,need}}
    if(status==="closed")return {state:hit(c)?"won":"lost",txt:`Final: ${c} ${S.long}`,v:c,need};return null}
  if(status==="inprogress"||status==="halftime")return {state:"live",txt:`Game is live${q}. Yards and catches settle when official stats post.`};
  if(status==="closed")return {state:"pending",txt:"Game over. Settles when official stats post, usually overnight."};
  return null;
}
function settlePicks(){let ch=false;
  book.picks.forEach(pk=>{if(pk.status!=="pending")return;const legs=pk.legs||(pk.leg?[pk.leg]:null);if(!legs)return;
    const rs=legs.map(legLive);
    if(rs.some(r=>r&&r.state==="lost")){pk.status="lost";pk.auto=legs.length>1?"A leg missed":(rs[0].txt);ch=true;return}
    if(rs.every(r=>r&&(r.state==="won"||r.state==="void"))){
      if(rs.every(r=>r.state==="void")){pk.status="void";pk.auto=rs[0].txt;ch=true;return}
      pk.status="won";pk.decWon=legs.reduce((a,l,i)=>rs[i].state==="void"?a:a*toDec(pk.odds?pk.odds[i]:bookOdds(l)),1);pk.auto=legs.length>1?"Every leg hit":rs[0].txt;ch=true}});
  if(ch)save();return ch}
const liveLine=r=>r?`<small class="lv ${r.state}">${r.state==="live"?'<span class="livedot"></span>':""}${esc(r.txt)}</small>${r.need&&r.state==="live"?`<span class="prog"><i style="width:${Math.min(100,Math.round((r.v||0)/r.need*100))}%"></i></span>`:""}`:"";

// ============ LIVE LAYER ============
const LIVE={scores:null,injuries:null,weather:null,meta:null,players:null};
const gkey=g=>g.away+"@"+g.home;
function applyLive(){
  const sc=LIVE.scores&&LIVE.scores.games||{},wx=LIVE.weather&&LIVE.weather.games||{};
  W5.forEach(g=>{const s=sc[gkey(g)];if(s){g.live=s;if(s.status==="closed"||s.status==="complete")g.final=[s.as,s.hs]}
    const w=wx[gkey(g)];if(w)g.wx=w});
  const it=LIVE.injuries&&LIVE.injuries.teams;
  if(it&&LIVE.injuries.week===D.week){Object.keys(INJ).forEach(t=>{if(!it[t])INJ[t]=[]});
    Object.entries(it).forEach(([t,list])=>{INJ[t]=list.map(x=>({...x,k:PLAYERS.some(p=>p.team===t&&p.name===x.n)}))
      .sort((a,b)=>({Out:0,Doubtful:1,Questionable:2,DNP:3,Limited:4}[a.s]-{Out:0,Doubtful:1,Questionable:2,DNP:3,Limited:4}[b.s])||(b.k-a.k))})}
  const m=LIVE.meta;
  document.getElementById("livetag").innerHTML=m&&m.updated?`<span class="livedot"></span>Live · updated ${new Date(m.updated).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:`2026 · Week ${D.week}`;
  settlePicks();
  if(st.mode==="games")renderGames();
  else if(st.mode==="picks")renderPicks();
  else if(st.mode==="spots")renderSpots();
  else{if(document.activeElement&&document.activeElement.id==="line")render();else full()}
}
function typing(){const a=document.activeElement;return a&&(a.id==="askinput"||a.id==="stake"||(a.matches&&a.matches("[data-odds]")))}
function applyLiveSafe(){if(typing()){clearTimeout(liveT);liveT=setTimeout(applyLiveSafe,1500);return}applyLive()
}
let liveT;const liveSoon=()=>{clearTimeout(liveT);liveT=setTimeout(applyLiveSafe,150)};
// Live data: inside Claude it streams from the artifact database; on a regular website it polls live.json next to the page.
let lastLiveStamp="";
async function pollLiveFile(){try{const r=await fetch("live.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)return;const j=await r.json();
  const stamp=(j.meta&&j.meta.updated)||"";if(stamp&&stamp===lastLiveStamp)return;lastLiveStamp=stamp;
  Object.keys(LIVE).forEach(k=>{if(j[k]!==undefined)LIVE[k]=j[k]});liveSoon()}catch(e){}}
function startPolling(){pollLiveFile();setInterval(()=>{if(!document.hidden)pollLiveFile()},60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)pollLiveFile()})}
(async()=>{try{if(!window.claude||!window.claude.use){startPolling();return}const db=await window.claude.use("db");if(!db){startPolling();return}
  Object.keys(LIVE).forEach(k=>db.doc("live/"+k).onSnapshot(s=>{LIVE[k]=s.exists?s.data():null;liveSoon()},()=>{}))}catch(e){startPolling()}})();
const liveChip=g=>{const l=g.live;if(!l||g.final)return null;if(l.status==="inprogress")return `<span class="chip bad"><span class="livedot"></span>Live${l.q?" · Q"+l.q:""}${l.clock?" "+l.clock:""}</span>`;if(l.status==="halftime")return `<span class="chip mid">Halftime</span>`;return null};

// ============ MODE + EVENTS ============
const toTop=()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
function setMode(m){st.mode=m;
  ["props","games","spots","picks"].forEach(k=>document.getElementById(k+"View").hidden=k!==m);
  document.querySelectorAll("#modes button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.mode===m));
  if(m==="games")renderGames();if(m==="picks")renderPicks();if(m==="props")full();if(m==="spots")renderSpots();
}
function openPlayer(pid){const p=PLAYERS.find(x=>x.id===pid);Object.assign(st,{pid,stat:p.stats[0],side:"over",line:defLine(p,p.stats[0]),sel:p.log.length-1,tab:"tape"});document.getElementById("alts").innerHTML="";setMode("props");toTop()}
document.getElementById("modes").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(b)setMode(b.dataset.mode)});
document.getElementById("plist").innerHTML=PLAYERS.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.name)}">`).join("");
const EX=["Josh Allen 250+ pass yards","Puka Nacua 6+ receptions","Bijan Robinson anytime TD","Jaxon Smith-Njigba 80+ rec yards","Lamar Jackson under 50 rush yards"].filter(q=>parse(q));
document.getElementById("examples").innerHTML=EX.map(e=>`<button type="button">${esc(e)}</button>`).join("");
document.getElementById("examples").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;document.getElementById("q").value=b.textContent;run(b.textContent)});
function run(q){const r=parse(q),note=document.getElementById("note"),alts=document.getElementById("alts");
  if(!r){note.textContent="Couldn't find that player. Try their full name. The list covers starting QBs, top running backs, receivers and tight ends.";note.hidden=false;return}
  note.hidden=true;const p=PLAYERS.find(x=>x.id===r.pid);Object.assign(st,{pid:r.pid,stat:r.stat,side:r.side,line:r.line,sel:p.log.length-1,tab:"tape"});
  alts.innerHTML=r.alts.length?`<span class="hint">Did you mean:</span>${r.alts.map(a=>`<button type="button" data-player="${a.id}">${esc(a.name)} · ${a.team} ${a.pos}</button>`).join("")}`:"";
  full();document.getElementById("controls").scrollIntoView({behavior:"smooth",block:"start"})}
document.getElementById("alts").addEventListener("click",e=>{const b=e.target.closest("[data-player]");if(b)openPlayer(b.dataset.player)});
document.getElementById("qform").addEventListener("submit",e=>{e.preventDefault();run(document.getElementById("q").value)});
document.getElementById("controls").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
  if(b.hasAttribute("data-add")){toggleLeg(curLeg());renderControls();return}
  if(b.dataset.plus){st.line=+b.dataset.plus-.5;full();return}
  if(b.hasAttribute("data-resetline")){st.line=defLine(P(),st.stat);full();return}
  if(b.dataset.stat){st.stat=b.dataset.stat;st.line=defLine(P(),st.stat);full()}
  else if(b.dataset.side){st.side=b.dataset.side;full()}
  else if(b.dataset.step){st.line=Math.max(4.5,st.line+ +b.dataset.step);full()}});
document.getElementById("controls").addEventListener("change",e=>{if(e.target.id==="line"){const v=parseInt(e.target.value,10);if(!isNaN(v)){st.line=Math.max(1,v)-.5;full()}}});
document.getElementById("out").addEventListener("click",e=>{
  const go=e.target.closest("[data-goto]");if(go){st.game=go.dataset.goto;st.gtab="pick";setMode("games");toTop();return}
  if(e.target.closest("[data-skipearly]")){st.skipEarly=!st.skipEarly;const n=games(P(),st.stat).length;st.sel=Math.min(st.sel,n-1);full();return}
  const t=e.target.closest("[data-tab]");if(t){st.tab=t.dataset.tab;render();return}
  const h=e.target.closest(".hitbox");if(h){select(+h.dataset.i);return}
  const tr=e.target.closest(".log tbody tr");if(tr){st.sel=+tr.dataset.i;st.tab="tape";render();document.getElementById("game").scrollIntoView({behavior:"smooth",block:"center"})}});
document.getElementById("gamesView").addEventListener("click",e=>{
  const f=e.target.closest("[data-filter]");if(f){st.filter=f.dataset.filter;renderGames();return}
  const pl=e.target.closest("[data-player]");if(pl){openPlayer(pl.dataset.player);return}
  const at=e.target.closest("[data-addteam]");if(at){const [gi,t]=at.dataset.addteam.split(":");toggleLeg({type:"team",game:gi,team:t});renderGames();return}
  const gm=e.target.closest("[data-game]");if(gm){st.game=gm.dataset.game;st.gtab="pick";renderGames();toTop();return}
  if(e.target.closest("[data-back]")){st.game=null;renderGames();toTop();return}
  const gt=e.target.closest("[data-gtab]");if(gt){st.gtab=gt.dataset.gtab;renderGames()}});
document.getElementById("spotsView").addEventListener("click",e=>{
  const f=e.target.closest("[data-sfilter]");if(f){st.sfilter=f.dataset.sfilter;renderSpots();return}
  const o=e.target.closest("[data-open]");if(o){const [pid,stat,side,line]=o.dataset.open.split("|");openPlayer(pid);Object.assign(st,{stat,side,line:+line});full();return}
  const a=e.target.closest("[data-spotadd]");if(a){const [pid,stat,side,line]=a.dataset.spotadd.split("|");toggleLeg({type:"prop",pid,stat,side,line:+line});renderSpots()}});
document.getElementById("picksView").addEventListener("change",e=>{
  if(e.target.id==="stake"){book.stake=Math.max(0,Math.min(100000,parseFloat(e.target.value)||0));save();renderPicks();return}
  const o=e.target.closest("[data-odds]");if(o){const k=+o.dataset.odds,v=parseAm(o.value);if(book.slip[k]){if(v==null){delete book.slip[k].odds;toast("Odds look like -110 or +150")}else book.slip[k].odds=v;save();renderPicks()}}});
document.getElementById("picksView").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target.id==="stake"||e.target.matches("[data-odds]")))e.target.blur()});
document.getElementById("picksView").addEventListener("click",e=>{
  const md=e.target.closest("[data-mode]");if(md){setMode(md.dataset.mode);toTop();return}
  const rl=e.target.closest("[data-rmleg]");if(rl){book.slip.splice(+rl.dataset.rmleg,1);save();updateCount();renderPicks();return}
  if(e.target.closest("[data-clear]")){book.slip=[];save();updateCount();renderPicks();return}
  if(e.target.closest("[data-log]")){const legs=book.slip.slice(),I=legs.map(legInfo),M=slipMath(legs,I),one=legs.length===1;
    book.picks.unshift({id:`p${Date.now()}`,title:one?I[0].title:`${legs.length}-leg parlay`,kind:one?I[0].kind:"Parlay",sub:one?`Week ${D.week} · ${I[0].sub}`:I.map(x=>x.short).join(" + "),
      prob:M.p,status:"pending",legs,odds:M.odds,dec:M.dec,stake:M.stake});
    book.slip=[];save();updateCount();renderPicks();toast(`Logged ${one?"bet":"parlay"} · ${money(M.stake)}`);return}
  const se=e.target.closest("[data-settle]");if(se){const [id,s]=se.dataset.settle.split(":");const p=book.picks.find(x=>x.id===id);if(p)p.status=s;save();renderPicks();return}
  const de=e.target.closest("[data-del]");if(de){book.picks=book.picks.filter(x=>x.id!==de.dataset.del);save();renderPicks()}});
function guard(fn,id){return function(){try{return fn.apply(this,arguments)}catch(e){console.error(e);const el=document.getElementById(id);if(el)el.innerHTML='<section class="card"><p class="note">Something went wrong showing this screen. Try another player or game, or reload the page.</p></section>'}}}
render=guard(render,"out");renderGames=guard(renderGames,"gamesView");renderSpots=guard(renderSpots,"spotsView");renderPicks=guard(renderPicks,"picksView");
document.getElementById("asof").textContent=`Real data through ${fmtDate(D.asof)}, 2026, Week ${D.week}, with live scores, injuries, weather and official stats added automatically through the week.`;
updateCount();
full();
