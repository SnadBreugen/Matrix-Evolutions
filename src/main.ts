import { getLoginStatus, createAudiotoolClient } from "@audiotool/nexus"
import { Ticks } from "@audiotool/nexus/utils"

const CLIENT_ID = "828a38f3-e19f-4574-a91d-deb5a405c507"
const REDIRECT_URL = "http://127.0.0.1:5173/"

interface NoteCell {
  pitch: number
  positionTicks: number
  durationTicks: number
  velocity: number
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}
function previewNote(pitch: number, durationSec = 0.2) {
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "square"
  osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12)
  gain.gain.setValueAtTime(0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec)
  osc.connect(gain); gain.connect(ctx.destination)
  osc.start(); osc.stop(ctx.currentTime + durationSec)
}

// ── Playback ──────────────────────────────────────────────────────────────────
let isPlaying = false
let playTimeouts: ReturnType<typeof setTimeout>[] = []

function stopPlayback(playBtn: HTMLButtonElement) {
  isPlaying = false
  playTimeouts.forEach(t => clearTimeout(t))
  playTimeouts = []
  playBtn.textContent = "▶  PLAY"
  playBtn.style.background = "var(--green)"
  playBtn.style.color = "#000"
}

function startPlayback(arpNotes: NoteCell[], playBtn: HTMLButtonElement, bpm: number) {
  if (!arpNotes.length) return
  isPlaying = true
  playBtn.textContent = "■  STOP"
  playBtn.style.background = "var(--orange)"
  playBtn.style.color = "#fff"
  const ticksPerMs = (bpm / 60 / 1000) * Ticks.SemiBreve / 4
  let stopped = false
  arpNotes.forEach(({ pitch, positionTicks, durationTicks }) => {
    const t = setTimeout(() => {
      if (!stopped) previewNote(pitch, Math.max(0.05, durationTicks / ticksPerMs / 1000))
    }, positionTicks / ticksPerMs)
    playTimeouts.push(t)
  })
  const totalMs = Math.max(...arpNotes.map(n => n.positionTicks + n.durationTicks)) / ticksPerMs
  playTimeouts.push(setTimeout(() => { stopped = true; stopPlayback(playBtn) }, totalMs + 200))
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROWS       = 24
const BASE_PITCH = 48           // C3
const BAR_TICKS  = Ticks.SemiBreve
const BARS       = 4            // always show 4 bars
const TOTAL_TICKS = BAR_TICKS * BARS

type SnapVal = "bar" | "1/4" | "1/8" | "1/16"
type RateDiv = "1/4" | "1/8" | "1/16" | "1/32"

const SNAP_TICKS: Record<SnapVal, number> = {
  "bar":  BAR_TICKS,
  "1/4":  BAR_TICKS / 4,
  "1/8":  BAR_TICKS / 8,
  "1/16": BAR_TICKS / 16,
}
const RATE_DIV_TICKS: Record<RateDiv, number> = {
  "1/4":  BAR_TICKS / 4,
  "1/8":  BAR_TICKS / 8,
  "1/16": BAR_TICKS / 16,
  "1/32": BAR_TICKS / 32,
}

// Piano roll: always 4 bars wide, cells = TOTAL_TICKS / snapTicks
const PIANO_W = 800   // fixed pixel width for 4 bars

let currentSnap: SnapVal = "bar"
let currentRateDiv: RateDiv = "1/16"
let notes: NoteCell[] = []
let arpDirection: "up"|"down"|"updown"|"zigzag"|"random" = "up"
let arpOctaves   = 1
let arpVelocity  = 0.7
let arpRepeat    = 0.0   // 0..1 → 1..4 repeats per note
let arpGate      = 0.7
let arpRate      = 0.5   // 0..1 used cosmetically (knob position)
let currentBpm   = 120

function pitchName(p: number) {
  return ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][p % 12] + Math.floor(p / 12 - 1)
}
function isBlack(p: number) { return [1,3,6,8,10].includes(p % 12) }

// cell width in pixels for current snap
function cellW() { return PIANO_W / (TOTAL_TICKS / SNAP_TICKS[currentSnap]) }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const status = await getLoginStatus({ clientId: CLIENT_ID, redirectUrl: REDIRECT_URL, scope: "project:write" })

  if (!status.loggedIn) {
    document.body.innerHTML = ""
    document.body.style.cssText = "display:flex;align-items:center;justify-content:center;height:100vh;background:#111118;font-family:'Space Mono',monospace;"
    const btn = document.createElement("button")
    btn.textContent = "LOGIN WITH AUDIOTOOL"
    btn.style.cssText = "padding:14px 32px;background:#c542f5;color:#fff;border:none;border-radius:3px;font-family:inherit;font-size:12px;letter-spacing:2px;cursor:pointer;"
    btn.addEventListener("click", () => status.login())
    document.body.appendChild(btn)
    await new Promise(() => {})
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement("style")
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --purple:#c542f5;--orange:#ff6a00;--green:#aaff00;
      --bg:#111118;--panel:#1c1c28;--panel2:#161622;
      --border:#3a3a55;--border2:#282840;
      --text:#e8e4ff;--muted:#9090bb;
      --gridline:#2a2a42;--gridline-beat:#3a3a58;--gridline-bar:#4a4a70;
      --key-w:#1e1e2e;--key-b:#111120;
    }
    body{background:var(--bg);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;min-height:100vh;}
    .app{max-width:1100px;margin:0 auto;padding:20px 16px;}
    .header{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;}
    .logo{font-size:22px;font-weight:700;letter-spacing:5px;color:var(--purple);text-shadow:0 0 30px #c542f540;}
    .logo span{color:var(--orange);}
    .tagline{font-size:9px;letter-spacing:3px;color:var(--muted);}

    /* control panel */
    .cpanel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px 20px;margin-bottom:14px;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;}
    .knob-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;}
    .knob{width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#32324a,#0e0e18);border:2px solid var(--border);box-shadow:0 2px 8px #00000060,inset 0 1px 0 #ffffff08;cursor:ns-resize;position:relative;user-select:none;}
    .knob-label{font-size:9px;letter-spacing:1.5px;color:var(--muted);}
    .vdiv{width:1px;background:var(--border2);align-self:stretch;margin:0 4px;}
    .ctrl-col{display:flex;flex-direction:column;gap:5px;}
    .ctrl-title{font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:3px;}
    .ritem{display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--muted);font-size:10px;line-height:1.8;transition:color .1s;}
    .ritem:hover{color:var(--text);}
    .ritem.on{color:var(--green);}
    .rdot{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor;position:relative;flex-shrink:0;}
    .ritem.on .rdot::after{content:'';position:absolute;top:1.5px;left:1.5px;width:3px;height:3px;border-radius:50%;background:var(--green);}
    .btn-grp{display:flex;gap:4px;}
    .tbtn{padding:5px 10px;background:var(--panel2);border:1px solid var(--border2);border-radius:3px;color:var(--muted);cursor:pointer;font-family:inherit;font-size:10px;transition:all .1s;}
    .tbtn:hover{border-color:var(--purple);color:var(--text);}
    .tbtn.on{background:var(--purple);border-color:var(--purple);color:#fff;}
    .tbtn.snap-on{background:var(--orange);border-color:var(--orange);color:#fff;}
    .tbtn.rate-on{background:var(--green);border-color:var(--green);color:#000;font-weight:700;}
    .bpm-wrap{display:flex;flex-direction:column;gap:4px;}
    .bpm-display{font-size:26px;font-weight:700;color:var(--orange);letter-spacing:2px;cursor:ns-resize;user-select:none;line-height:1;}

    /* piano roll */
    .roll-sec{font-size:9px;letter-spacing:1.5px;color:var(--muted);margin-bottom:6px;}
    .roll-wrap{background:var(--panel2);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px;}
    .roll-head{display:flex;border-bottom:1px solid var(--border);}
    .roll-corner{width:52px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);}
    .bar-nums{display:flex;width:${PIANO_W}px;flex-shrink:0;}
    .bar-num{flex:1;text-align:center;padding:5px 0;font-size:10px;color:var(--orange);border-right:1px solid var(--gridline-bar);letter-spacing:1px;}
    .roll-body{display:flex;}
    .piano{width:52px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);}
    .p-key{height:20px;display:flex;align-items:center;justify-content:flex-end;padding-right:5px;border-bottom:1px solid var(--gridline);font-size:8px;cursor:pointer;transition:background .1s;}
    .p-key.w{background:var(--key-w);color:var(--muted);}
    .p-key.w:hover{background:#28284a;color:var(--text);}
    .p-key.b{background:var(--key-b);color:#55558a;}
    .p-key.b:hover{background:#1e1e36;}
    .p-key.c{color:var(--orange);}

    /* grid */
    .grid-wrap{position:relative;width:${PIANO_W}px;flex-shrink:0;}
    .g-row{display:flex;height:20px;border-bottom:1px solid var(--gridline);position:relative;}
    .g-row.bk{background:#0f0f1c;}
    .g-cell{height:20px;border-right:1px solid var(--gridline);cursor:crosshair;flex-shrink:0;}
    .g-cell:hover{background:#252540;}
    .g-cell.beat{border-right-color:var(--gridline-beat);}
    .g-cell.bar{border-right-color:var(--gridline-bar);}

    /* note blocks */
    .note-layer{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:all;z-index:3;}
    .nb{position:absolute;top:2px;height:16px;background:var(--purple);border-radius:3px;cursor:grab;pointer-events:all;box-shadow:0 0 8px #c542f560;min-width:4px;}
    .nb:hover{background:#d45eff;}
    .nb-resize{position:absolute;right:0;top:0;width:6px;height:100%;cursor:ew-resize;background:rgba(255,255,255,0.2);border-radius:0 3px 3px 0;}

    /* bottom */
    .bottom{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
    .play-btn{padding:10px 22px;background:var(--green);border:none;border-radius:4px;color:#000;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;white-space:nowrap;}
    .play-btn:hover{opacity:.85;}
    .url-in{flex:1;min-width:220px;padding:10px 14px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:4px;font-family:inherit;font-size:11px;outline:none;}
    .url-in:focus{border-color:var(--purple);}
    .url-in::placeholder{color:var(--muted);}
    .clr-btn{padding:10px 14px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);font-family:inherit;font-size:11px;cursor:pointer;transition:all .15s;}
    .clr-btn:hover{border-color:var(--orange);color:var(--orange);}
    .write-btn{padding:10px 20px;background:var(--purple);border:none;border-radius:4px;color:#fff;font-family:inherit;font-size:11px;letter-spacing:1px;cursor:pointer;white-space:nowrap;}
    .write-btn:hover{background:#d855ff;}
    .write-btn:disabled{background:var(--muted);cursor:not-allowed;}
    .status{color:var(--muted);font-size:10px;letter-spacing:1px;}
    .status.ok{color:var(--green);}
    .status.err{color:var(--orange);}
    body.drag-cursor *{cursor:grabbing !important;}
  `
  document.head.appendChild(style)

  document.body.innerHTML = ""
  const app = document.createElement("div"); app.className = "app"; document.body.appendChild(app)
  app.innerHTML = `<div class="header"><div class="logo">MATRIX <span>EVOLUTIONS</span></div><div class="tagline">ARPEGGIATOR → AUDIOTOOL</div></div>`

  // ── Control panel ────────────────────────────────────────────────────────────
  const cpanel = document.createElement("div"); cpanel.className = "cpanel"; app.appendChild(cpanel)

  function makeKnob(label: string, color: string, initial: number, cb: (v: number) => void) {
    const wrap = document.createElement("div"); wrap.className = "knob-wrap"
    const knob = document.createElement("div"); knob.className = "knob"
    const col = color==="purple"?"#c542f5":color==="green"?"#aaff00":"#ff6a00"
    const needle = document.createElement("div")
    needle.style.cssText = `position:absolute;width:3px;height:16px;border-radius:2px;left:50%;top:4px;transform-origin:bottom center;background:${col};pointer-events:none;`
    knob.appendChild(needle)
    wrap.appendChild(knob)
    wrap.appendChild(Object.assign(document.createElement("div"),{className:"knob-label",textContent:label}))
    let val=initial, down=false, sy=0, sv=0
    const set=(v:number)=>{val=Math.max(0,Math.min(1,v));needle.style.transform=`translateX(-50%) rotate(${-140+val*280}deg)`;cb(val)}
    set(initial)
    knob.addEventListener("mousedown",e=>{down=true;sy=e.clientY;sv=val;e.preventDefault()})
    document.addEventListener("mousemove",e=>{if(down) set(sv-(e.clientY-sy)/120)})
    document.addEventListener("mouseup",()=>{down=false})
    return wrap
  }

  cpanel.appendChild(makeKnob("VELOCITY","orange",arpVelocity, v=>{arpVelocity=v}))
  cpanel.appendChild(makeKnob("RATE",    "purple",arpRate,     v=>{arpRate=v}))
  cpanel.appendChild(makeKnob("REPEAT",  "orange",arpRepeat,   v=>{arpRepeat=v}))
  cpanel.appendChild(makeKnob("GATE",    "green", arpGate,     v=>{arpGate=v}))
  cpanel.appendChild(Object.assign(document.createElement("div"),{className:"vdiv"}))

  // Direction
  const dirCol = document.createElement("div"); dirCol.className="ctrl-col"
  dirCol.appendChild(Object.assign(document.createElement("div"),{className:"ctrl-title",textContent:"DIRECTION"}))
  ;[["up","Up"],["down","Down"],["updown","Up / Down"],["zigzag","Zig Zack"],["random","Random"]].forEach(([v,l],i)=>{
    const item=document.createElement("div"); item.className="ritem"+(i===0?" on":""); item.dataset.v=v
    item.innerHTML=`<div class="rdot"></div>${l}`
    item.addEventListener("click",()=>{dirCol.querySelectorAll(".ritem").forEach(x=>x.classList.remove("on"));item.classList.add("on");arpDirection=v as typeof arpDirection})
    dirCol.appendChild(item)
  })
  cpanel.appendChild(dirCol)
  cpanel.appendChild(Object.assign(document.createElement("div"),{className:"vdiv"}))

  // Octaves
  const octCol = document.createElement("div"); octCol.className="ctrl-col"
  octCol.appendChild(Object.assign(document.createElement("div"),{className:"ctrl-title",textContent:"OCTAVES"}))
  ;[1,2,3,4].forEach((n,i)=>{
    const item=document.createElement("div"); item.className="ritem"+(i===0?" on":""); item.dataset.v=String(n)
    item.innerHTML=`<div class="rdot"></div>${n} Octave${n>1?"s":""}`
    item.addEventListener("click",()=>{octCol.querySelectorAll(".ritem").forEach(x=>x.classList.remove("on"));item.classList.add("on");arpOctaves=n})
    octCol.appendChild(item)
  })
  cpanel.appendChild(octCol)
  cpanel.appendChild(Object.assign(document.createElement("div"),{className:"vdiv"}))

  // Rate div + Snap
  const rsCol = document.createElement("div"); rsCol.className="ctrl-col"; rsCol.style.gap="12px"

  const rateWrap = document.createElement("div"); rateWrap.className="ctrl-col"
  rateWrap.appendChild(Object.assign(document.createElement("div"),{className:"ctrl-title",textContent:"RATE DIV"}))
  const rateRow = document.createElement("div"); rateRow.className="btn-grp"; rateWrap.appendChild(rateRow)
  ;[["1/4","1/4"],["1/8","1/8"],["1/16","1/16"],["1/32","1/32"]].forEach(([v,l])=>{
    const b=document.createElement("button"); b.className="tbtn"+(v==="1/16"?" rate-on":""); b.textContent=l
    b.addEventListener("click",()=>{rateRow.querySelectorAll("button").forEach(x=>x.classList.remove("rate-on"));b.classList.add("rate-on");currentRateDiv=v as RateDiv})
    rateRow.appendChild(b)
  })
  rsCol.appendChild(rateWrap)

  const snapWrap = document.createElement("div"); snapWrap.className="ctrl-col"
  snapWrap.appendChild(Object.assign(document.createElement("div"),{className:"ctrl-title",textContent:"SNAP"}))
  const snapRow = document.createElement("div"); snapRow.className="btn-grp"; snapWrap.appendChild(snapRow)
  ;[["bar","1 BAR"],["1/4","1/4"],["1/8","1/8"],["1/16","1/16"]].forEach(([v,l])=>{
    const b=document.createElement("button"); b.className="tbtn"+(v==="bar"?" snap-on":""); b.textContent=l
    b.addEventListener("click",()=>{
      snapRow.querySelectorAll("button").forEach(x=>x.classList.remove("snap-on")); b.classList.add("snap-on")
      currentSnap=v as SnapVal; buildGrid(); renderNotes()
    })
    snapRow.appendChild(b)
  })
  rsCol.appendChild(snapWrap)
  cpanel.appendChild(rsCol)
  cpanel.appendChild(Object.assign(document.createElement("div"),{className:"vdiv"}))

  // BPM
  const bpmWrap = document.createElement("div"); bpmWrap.className="bpm-wrap"
  bpmWrap.appendChild(Object.assign(document.createElement("div"),{className:"ctrl-title",textContent:"BPM"}))
  const bpmDisplay = document.createElement("div"); bpmDisplay.className="bpm-display"; bpmDisplay.textContent="120"
  let bpmDown=false, bpmSy=0, bpmSv=120
  bpmDisplay.addEventListener("mousedown",e=>{bpmDown=true;bpmSy=e.clientY;bpmSv=currentBpm;e.preventDefault()})
  document.addEventListener("mousemove",e=>{
    if(!bpmDown) return
    currentBpm=Math.max(40,Math.min(240,Math.round(bpmSv-(e.clientY-bpmSy)*0.5)))
    bpmDisplay.textContent=String(currentBpm)
  })
  document.addEventListener("mouseup",()=>{bpmDown=false})
  bpmWrap.appendChild(bpmDisplay)
  cpanel.appendChild(bpmWrap)

  // ── Piano Roll ──────────────────────────────────────────────────────────────
  app.appendChild(Object.assign(document.createElement("div"),{className:"roll-sec",
    textContent:"PIANO ROLL  —  LEFT CLICK: ADD  ·  RIGHT CLICK: REMOVE  ·  DRAG: MOVE  ·  CTRL+DRAG: COPY  ·  DRAG RIGHT EDGE: RESIZE"}))

  const rollWrap = document.createElement("div"); rollWrap.className="roll-wrap"; app.appendChild(rollWrap)

  // header: bar numbers
  const rollHead = document.createElement("div"); rollHead.className="roll-head"; rollWrap.appendChild(rollHead)
  rollHead.appendChild(Object.assign(document.createElement("div"),{className:"roll-corner"}))
  const barNums = document.createElement("div"); barNums.className="bar-nums"; rollHead.appendChild(barNums)
  for(let b=1;b<=BARS;b++){
    barNums.appendChild(Object.assign(document.createElement("div"),{className:"bar-num",textContent:`BAR ${b}`}))
  }

  const rollBody = document.createElement("div"); rollBody.className="roll-body"; rollWrap.appendChild(rollBody)

  // piano keys – ALL notes labelled
  const piano = document.createElement("div"); piano.className="piano"; rollBody.appendChild(piano)
  for(let r=0;r<ROWS;r++){
    const pitch=BASE_PITCH+(ROWS-1-r), bk=isBlack(pitch), isC=pitch%12===0
    const key=document.createElement("div")
    key.className="p-key "+(bk?"b":"w")+(isC?" c":"")
    key.textContent=pitchName(pitch)   // always show name
    key.addEventListener("click",()=>previewNote(pitch))
    piano.appendChild(key)
  }

  // grid
  const gridWrap = document.createElement("div"); gridWrap.className="grid-wrap"; rollBody.appendChild(gridWrap)
  const noteLayer = document.createElement("div"); noteLayer.className="note-layer"; gridWrap.appendChild(noteLayer)

  const rowEls: HTMLDivElement[] = []
  for(let r=0;r<ROWS;r++){
    const pitch=BASE_PITCH+(ROWS-1-r)
    const row=document.createElement("div"); row.className="g-row"+(isBlack(pitch)?" bk":"")
    row.dataset.r=String(r); gridWrap.appendChild(row); rowEls.push(row)
  }

  function buildGrid(){
    const cw=cellW()
    const totalCells=TOTAL_TICKS/SNAP_TICKS[currentSnap]
    rowEls.forEach(row=>{
      while(row.firstChild) row.firstChild.remove()
      for(let c=0;c<totalCells;c++){
        const cell=document.createElement("div"); cell.className="g-cell"
        cell.style.width=cw+"px"
        const tickPos=c*SNAP_TICKS[currentSnap]
        // mark beat and bar lines
        if(tickPos>0 && tickPos%BAR_TICKS===0) cell.classList.add("bar")
        else if(tickPos%(BAR_TICKS/4)===0) cell.classList.add("beat")
        cell.dataset.r=row.dataset.r; cell.dataset.c=String(c)
        row.appendChild(cell)
      }
    })
  }
  buildGrid()

  // render note blocks
  function renderNotes(){
    noteLayer.innerHTML=""
    const cw=cellW(), snap=SNAP_TICKS[currentSnap]
    for(const n of notes){
      const col=n.positionTicks/snap
      const row=ROWS-1-(n.pitch-BASE_PITCH)
      if(row<0||row>=ROWS||col<0||col>=TOTAL_TICKS/snap) continue
      const durCols=Math.max(1,n.durationTicks/snap)
      const nb=document.createElement("div"); nb.className="nb"
      nb.style.cssText=`left:${col*cw}px;top:${row*20}px;width:${Math.max(durCols*cw-2,4)}px;`
      nb.dataset.pitch=String(n.pitch); nb.dataset.pos=String(n.positionTicks)
      const handle=document.createElement("div"); handle.className="nb-resize"
      nb.appendChild(handle); noteLayer.appendChild(nb)
    }
  }

  // ── Interaction ─────────────────────────────────────────────────────────────
  let mouseDown=false, ctrlHeld=false
  let imode:"none"|"draw"|"drag"|"resize"="none"
  let dragNote:NoteCell|null=null, resizeNote:NoteCell|null=null
  let lastMouseX=0, lastPreviewP=-1

  document.addEventListener("keydown",e=>{
    if(e.ctrlKey||e.metaKey) ctrlHeld=true
    if(e.code==="Space"&&!(e.target instanceof HTMLInputElement)){
      e.preventDefault()
      if(isPlaying) stopPlayback(playBtn)
      else{ const an=generateArpNotes(); startPlayback(an,playBtn,currentBpm) }
    }
  })
  document.addEventListener("keyup",()=>{ctrlHeld=false})

  function getCellFromPoint(x:number,y:number):{r:number,c:number,tickPos:number}|null{
    const cw=cellW()
    const rect=gridWrap.getBoundingClientRect()
    const lx=x-rect.left, ly=y-rect.top
    const totalCells=TOTAL_TICKS/SNAP_TICKS[currentSnap]
    const c=Math.floor(lx/cw), r=Math.floor(ly/20)
    if(r<0||r>=ROWS||c<0||c>=totalCells) return null
    return{r,c,tickPos:c*SNAP_TICKS[currentSnap]}
  }

  // Right click anywhere = delete note
  gridWrap.addEventListener("contextmenu",e=>{
    e.preventDefault()
    const rc=getCellFromPoint(e.clientX,e.clientY); if(!rc) return
    const pitch=BASE_PITCH+(ROWS-1-rc.r)
    notes=notes.filter(n=>!(n.pitch===pitch&&n.positionTicks===rc.tickPos))
    renderNotes()
  })
  noteLayer.addEventListener("contextmenu",e=>{
    e.preventDefault()
    const nb=(e.target as HTMLElement).closest(".nb") as HTMLElement|null; if(!nb) return
    const pitch=Number(nb.dataset.pitch), pos=Number(nb.dataset.pos)
    notes=notes.filter(n=>!(n.pitch===pitch&&n.positionTicks===pos))
    renderNotes()
  })

  // Note drag/resize on left click
  noteLayer.addEventListener("mousedown",e=>{
    if(e.button!==0) return; e.preventDefault()
    const target=e.target as HTMLElement
    const nb=target.closest(".nb") as HTMLElement|null; if(!nb) return
    const pitch=Number(nb.dataset.pitch), pos=Number(nb.dataset.pos)
    const note=notes.find(n=>n.pitch===pitch&&n.positionTicks===pos); if(!note) return
    mouseDown=true; lastMouseX=e.clientX
    if(target.classList.contains("nb-resize")){imode="resize";resizeNote=note}
    else{imode="drag";dragNote=note;document.body.classList.add("drag-cursor")}
  })

  // Double click to ADD note
  gridWrap.addEventListener("dblclick",e=>{
    if((e.target as HTMLElement).closest(".nb")) return
    const rc=getCellFromPoint(e.clientX,e.clientY); if(!rc) return
    const snap=SNAP_TICKS[currentSnap], pitch=BASE_PITCH+(ROWS-1-rc.r)
    if(notes.find(n=>n.pitch===pitch&&n.positionTicks===rc.tickPos)) return
    notes.push({pitch,positionTicks:rc.tickPos,durationTicks:snap,velocity:arpVelocity})
    previewNote(pitch); renderNotes()
  })

  document.addEventListener("mousemove",e=>{
    if(!mouseDown) return
    const snap=SNAP_TICKS[currentSnap], cw=cellW()
    if(imode==="drag"&&dragNote){
      const rc=getCellFromPoint(e.clientX,e.clientY); if(!rc) return
      const newPitch=BASE_PITCH+(ROWS-1-rc.r), newPos=rc.tickPos
      if(newPitch===dragNote.pitch&&newPos===dragNote.positionTicks) return
      if(newPitch!==lastPreviewP){previewNote(newPitch);lastPreviewP=newPitch}
      if(!ctrlHeld) notes=notes.filter(n=>n!==dragNote)
      if(!notes.find(n=>n.pitch===newPitch&&n.positionTicks===newPos)){
        const nn:NoteCell={pitch:newPitch,positionTicks:newPos,durationTicks:dragNote.durationTicks,velocity:dragNote.velocity}
        notes.push(nn); dragNote=nn
      }
      renderNotes()
    }
    if(imode==="resize"&&resizeNote){
      const dx=e.clientX-lastMouseX, deltaCols=Math.round(dx/cw)
      if(deltaCols!==0){
        resizeNote.durationTicks=Math.max(snap,resizeNote.durationTicks+deltaCols*snap)
        lastMouseX=e.clientX; renderNotes()
      }
    }
  })

  document.addEventListener("mouseup",()=>{
    mouseDown=false;imode="none";dragNote=null;resizeNote=null;lastPreviewP=-1
    document.body.classList.remove("drag-cursor")
  })

  // ── Bottom bar ──────────────────────────────────────────────────────────────
  const bottom=document.createElement("div"); bottom.className="bottom"; app.appendChild(bottom)

  const playBtn=document.createElement("button"); playBtn.className="play-btn"; playBtn.textContent="▶  PLAY"
  playBtn.addEventListener("click",()=>{
    if(isPlaying){stopPlayback(playBtn);return}
    const an=generateArpNotes()
    if(!an.length){statusEl.textContent="NO NOTES";statusEl.className="status err";return}
    startPlayback(an,playBtn,currentBpm)
  })
  bottom.appendChild(playBtn)

  const urlIn=document.createElement("input"); urlIn.className="url-in"; urlIn.placeholder="Paste Audiotool project URL…"; bottom.appendChild(urlIn)

  // Synth selector
  let selectedSynth: "heisenberg" | "pulverisateur" = "heisenberg"
  const synthWrap=document.createElement("div"); synthWrap.style.cssText="display:flex;gap:4px;flex-shrink:0;"
  ;[["heisenberg","HEISENBERG"],["pulverisateur","PULVERISATEUR"]].forEach(([v,l])=>{
    const b=document.createElement("button"); b.className="tbtn"+(v==="heisenberg"?" on":"")
    b.textContent=l; b.style.fontSize="9px"; b.style.padding="5px 8px"
    b.addEventListener("click",()=>{
      synthWrap.querySelectorAll("button").forEach(x=>x.classList.remove("on"))
      b.classList.add("on"); selectedSynth=v as typeof selectedSynth
    })
    synthWrap.appendChild(b)
  })
  bottom.appendChild(synthWrap)

  const clrBtn=document.createElement("button"); clrBtn.className="clr-btn"; clrBtn.textContent="CLEAR"
  clrBtn.addEventListener("click",()=>{notes=[];renderNotes()}); bottom.appendChild(clrBtn)
  const writeBtn=document.createElement("button"); writeBtn.className="write-btn"; writeBtn.textContent="▶ WRITE TO AUDIOTOOL"; bottom.appendChild(writeBtn)
  const statusEl=document.createElement("span"); statusEl.className="status"; bottom.appendChild(statusEl)

  // ── Arp generator ────────────────────────────────────────────────────────────
  // Generate arp notes respecting which piano roll notes are active at each moment
  function generateArpNotes(): NoteCell[] {
    if(!notes.length) return []
    const rateTicks = RATE_DIV_TICKS[currentRateDiv]
    const gate      = Math.max(1, Math.round(rateTicks * arpGate))
    const repeats   = 1 + Math.round(arpRepeat * 3)  // 1..4
    const result: NoteCell[] = []

    // iterate through time in rate steps
    let t = 0
    while(t < TOTAL_TICKS){
      // find which piano roll notes are active at tick t
      const activePitches = notes
        .filter(n => n.positionTicks <= t && (n.positionTicks + n.durationTicks) > t)
        .map(n => n.pitch)
        .sort((a,b)=>a-b)

      if(activePitches.length > 0){
        // expand octaves
        let pitches = [...activePitches]
        const base = [...pitches]
        for(let o=1;o<arpOctaves;o++) base.forEach(p=>pitches.push(p+o*12))
        pitches.sort((a,b)=>a-b)

        // direction
        let seq: number[]
        switch(arpDirection){
          case"down":   seq=[...pitches].reverse(); break
          case"updown": seq=[...pitches,...[...pitches].reverse().slice(1,-1)]; break
          case"zigzag": seq=pitches.filter((_,i)=>i%2===0).concat(pitches.filter((_,i)=>i%2!==0)); break
          case"random": seq=[...pitches].sort(()=>Math.random()-.5); break
          default:      seq=pitches
        }

        // repeat each note
        const fullSeq: number[] = []
        seq.forEach(p=>{ for(let r=0;r<repeats;r++) fullSeq.push(p) })

        // pick one note from sequence based on position within pattern
        const stepIndex = Math.floor(t / rateTicks) % fullSeq.length
        const pitch = fullSeq[stepIndex]
        result.push({
          pitch,
          positionTicks: t,
          durationTicks: gate,
          velocity: Math.min(1, arpVelocity * (0.9 + Math.random() * 0.1))
        })
      }
      t += rateTicks
    }
    return result
  }

  // ── Write to Audiotool ───────────────────────────────────────────────────────
  writeBtn.addEventListener("click",async()=>{
    const url=urlIn.value.trim()
    if(!url){statusEl.textContent="ENTER URL";statusEl.className="status err";return}
    if(!notes.length){statusEl.textContent="NO NOTES";statusEl.className="status err";return}
    const an=generateArpNotes()
    if(!an.length){statusEl.textContent="NO NOTES GENERATED";statusEl.className="status err";return}
    try{
      writeBtn.disabled=true; statusEl.textContent="CONNECTING…"; statusEl.className="status"
      const client=await createAudiotoolClient({authorization:status as any})
      const nexus=await client.createSyncedDocument({mode:"online",project:url})
      await nexus.start()
      statusEl.textContent="SEARCHING SYNTH…"
      const synths=nexus.queryEntities.ofTypes(selectedSynth).get()
      if(!synths.length){statusEl.textContent=`NO ${selectedSynth.toUpperCase()} FOUND`;statusEl.className="status err";writeBtn.disabled=false;return}
      statusEl.textContent="WRITING…"
      const rateTicks=RATE_DIV_TICKS[currentRateDiv]
      const total=an.reduce((m,n)=>Math.max(m,n.positionTicks+n.durationTicks),0)
      await nexus.modify(t=>{
        const track=t.create("noteTrack",{orderAmongTracks:0,player:synths[0].location})
        const col=t.create("noteCollection",{})
        t.create("noteRegion",{track:track.location,collection:col.location,region:{positionTicks:0,durationTicks:total+rateTicks}})
        an.forEach(({pitch,positionTicks,durationTicks,velocity})=>
          t.create("note",{collection:col.location,pitch,positionTicks,durationTicks,velocity})
        )
      })
      statusEl.textContent=`✓ ${an.length} NOTES WRITTEN`; statusEl.className="status ok"
    }catch(err){statusEl.textContent="ERROR: "+err;statusEl.className="status err"}
    finally{writeBtn.disabled=false}
  })
}

main().catch(console.error)