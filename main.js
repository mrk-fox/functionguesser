// Function Guesser main.js
(function(){
  // Utilities
  function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

  // Game state
  let level = 1;
  let target = null; // {expr, fn, desc}
  let canvas, ctx, width, height;
  let xRange = 10;
  let showNumbers = true;
  let showQueryPoints = true;
  let panX = 0, panY = 0; // for mouse panning
  let isDragging = false, dragStartX = 0, dragStartY = 0;
  const queryHistory = [];

  function generateTarget(l){
    // Increase complexity with level
    if(l<=1) return constant(1);
    if(l===2) return linear();
    if(l===3) return quadratic();
    if(l===4) return cubic();
    if(l===5) return polynomial(4);
    if(l===6) return trig();
    // for higher levels mix types and coefficients
    const p = l%6;
    if(p===1) return constant(randInt(-5,5)||1);
    if(p===2) return linear();
    if(p===3) return quadratic();
    if(p===4) return polynomial(3);
    if(p===5) return trig();
    return polynomial(4);
  }

  function constant(c){return {expr: String(c), fn: (x)=>c, desc:'constant'} }
  function linear(){const a=randInt(-5,5); const b=randInt(-6,6); return {expr:`${a}*x+${b}`, fn:(x)=>a*x+b, desc:'linear'}}
  function quadratic(){const a=randInt(-3,3)||1;const b=randInt(-5,5);const c=randInt(-6,6);return {expr:`${a}*x*x+${b}*x+${c}`,fn:(x)=>a*x*x+b*x+c,desc:'quadratic'}}
  function cubic(){const a=randInt(-2,2)||1;const b=randInt(-4,4);const c=randInt(-4,4);const d=randInt(-5,5);return {expr:`${a}*x*x*x+${b}*x*x+${c}*x+${d}`,fn:(x)=>a*x*x*x+b*x*x+c*x+d,desc:'cubic'}}
  function polynomial(deg){let terms=[]; for(let i=deg;i>=0;i--){terms.push(randInt(-3,3)||0 + (i===0?randInt(-6,6):0))} // ensure randomness
    let exprParts=[]; let coefs=terms; for(let i=0;i<coefs.length;i++){const power=coefs.length-1-i; const c=coefs[i]; if(c===0) continue; if(power===0) exprParts.push(`${c}`); else if(power===1) exprParts.push(`${c}*x`); else exprParts.push(`${c}*x^${power}`)}
    // fallback constant
    if(exprParts.length===0) return constant(randInt(0,5)||1);
    // Simplified fn using eval-safe creation
    const expr = exprParts.join('+').replace(/x\*x\*x\*x/g,'x*x*x*x').replace(/x\*x\*x/g,'x*x*x').replace(/x\*x/g,'x*x');
    const fn = new Function('x','return '+expr);
    return {expr,fn,desc:'polynomial'}
  }
  function trig(){const A=randInt(1,4); const B=randInt(1,4); const C=(randInt(-3,3)/2).toFixed(2); const D=randInt(-3,3); const expr=`${A}*Math.sin(${B}*x+${C})+${D}`; const fn=(x)=>A*Math.sin(B*x+parseFloat(C))+D; return {expr,fn,desc:'trigonometric'} }

  // Convert divisions to LaTeX fractions
  function toLatexFraction(input){
    if(!input) return input;
    let result = input;
    
    // Match division patterns and convert to \frac{numerator}{denominator}
    // This handles: a/b, (a)/b, a/(b), (a)/(b) etc.
    // We need to be careful to match complete numerators and denominators
    
    // Match patterns like: (something)/something or number/something
    result = result.replace(/(\([^)]+\))\/([^\/\s+\-]+)/g, '\\frac{$1}{$2}');  // (a)/b -> \frac{(a)}{b}
    result = result.replace(/(\d+)\/([^\/\s+\-]+)/g, '\\frac{$1}{$2}');         // 2/x -> \frac{2}{x}
    result = result.replace(/([a-zA-Z])\/([^\/\s+\-]+)/g, '\\frac{$1}{$2}');    // x/2 -> \frac{x}{2}
    
    return result;
  }
  function latexToJs(latex){
    if(!latex) return null;
    let js = latex.trim();
    
    // Replace LaTeX operators with JS equivalents
    js = js.replace(/\\sin/g, 'sin');
    js = js.replace(/\\cos/g, 'cos');
    js = js.replace(/\\tan/g, 'tan');
    js = js.replace(/\\log/g, 'log');
    js = js.replace(/\\ln/g, 'log');
    js = js.replace(/\\exp/g, 'exp');
    js = js.replace(/\\sqrt/g, 'sqrt');
    js = js.replace(/\\pi/g, 'PI');
    js = js.replace(/\\e/g, 'E');
    
    // Handle implicit multiplication: 2x -> 2*x, )( -> )*(, x( -> x*(
    js = js.replace(/(\d)([a-zA-Z])/g, '$1*$2');  // 2x -> 2*x
    js = js.replace(/([a-zA-Z])\(/g, '$1(');      // sin( stays as is
    js = js.replace(/\)\(/g, ')*(');               // )( -> )*(
    js = js.replace(/(\d)\(/g, '$1*(');            // 2( -> 2*(
    js = js.replace(/\)(\d)/g, ')*$1');            // )2 -> )*2
    js = js.replace(/([x])([a-z])/g, '$1*$2');    // x followed by function name: xsin -> x*sin
    js = js.replace(/\)([a-z])/g, ')*$1');        // ) followed by function: )sin -> )*sin
    
    // Handle exponents: ^ -> **
    js = js.replace(/\^/g, '**');
    
    // Handle sqrt notation sqrt{x} or sqrt(x)
    js = js.replace(/sqrt\{([^}]+)\}/g, 'sqrt($1)');
    
    // Remove spaces
    js = js.replace(/\s+/g, '');
    
    return js;
  }

  // Safe parser for user input (allows Math.* by using with(Math) trick)
  function parseUserExpr(s){
    if(!s) return null;
    
    // Convert LaTeX to JavaScript
    const jsExpr = latexToJs(s);
    if(!jsExpr) return null;
    
    try{
      const fn = new Function('x','with(Math){ return '+jsExpr+' }');
      // test
      fn(0);
      return fn;
    }catch(e){return null}
  }

  // Drawing
  function setupCanvas(){
    canvas = document.getElementById('canvas'); ctx = canvas.getContext('2d'); width=canvas.width;height=canvas.height;
  }

  function draw(){
    if(!ctx) return;
    ctx.clearRect(0,0,width,height);
    const showGrid = document.getElementById('showGrid').checked;
    const xr = xRange;
    const yr = xr * (height/width) * 0.9; // keep aspect

    // draw grid
    if(showGrid){
      ctx.strokeStyle='#e6e9f2'; ctx.lineWidth=1;
      for(let i=-xr;i<=xr;i++){
        const xpx = mapX(i,xr);
        ctx.beginPath(); ctx.moveTo(xpx,0); ctx.lineTo(xpx,height); ctx.stroke();
      }
      for(let j=Math.floor(-yr);j<=Math.ceil(yr);j++){
        const ypx = mapY(j,yr);
        ctx.beginPath(); ctx.moveTo(0,ypx); ctx.lineTo(width,ypx); ctx.stroke();
      }
    }
    // axes
    ctx.strokeStyle='#333'; ctx.lineWidth=2;
    // y axis x=0
    let x0 = mapX(0,xr); ctx.beginPath(); ctx.moveTo(x0,0); ctx.lineTo(x0,height); ctx.stroke();
    // x axis y=0
    let y0 = mapY(0,yr); ctx.beginPath(); ctx.moveTo(0,y0); ctx.lineTo(width,y0); ctx.stroke();

    // draw numbers on grid if enabled
    if(showNumbers){
      ctx.fillStyle='#888'; ctx.font='12px Inter, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
      for(let i=-xr;i<=xr;i++){
        if(i!==0){
          const xpx = mapX(i,xr);
          ctx.fillText(String(i), xpx, y0+8);
        }
      }
      ctx.textAlign='right'; ctx.textBaseline='middle';
      for(let j=Math.floor(-yr);j<=Math.ceil(yr);j++){
        if(j!==0){
          const ypx = mapY(j,yr);
          ctx.fillText(String(j), x0-8, ypx);
        }
      }
    }

    // draw target? We keep target hidden. For debugging you could toggle.
    // draw query points
    if(showQueryPoints && queryHistory.length > 0){
      ctx.fillStyle='rgba(234,88,12,0.9)'; ctx.strokeStyle='rgba(234,88,12,1)'; ctx.lineWidth=1;
      queryHistory.forEach(({x,y})=>{
        if(isFinite(y)){
          const px = mapX(x,xr);
          const py = mapY(y,yr);
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI*2);
          ctx.fill();
          ctx.stroke();
        }
      });
    }

    // draw user's guess
    const guessExpr = document.getElementById('guessInput').value.trim();
    const userFn = parseUserExpr(guessExpr);
    if(userFn){
      ctx.strokeStyle='rgba(36,123,255,0.95)'; ctx.lineWidth=2.5;
      plotFunction(userFn,xr,yr);
    }
  }

  function plotFunction(fn,xr,yr){
    ctx.beginPath();
    const steps = width; let first=true;
    for(let i=0;i<=steps;i++){
      const t = i/steps; const x = -xr + t*(xr*2);
      let y;
      try{ y = fn(x); if(!isFinite(y)) y=NaN }catch(e){ y=NaN }
      if(isNaN(y)) { first=false; continue }
      const px = mapX(x,xr); const py = mapY(y,yr);
      if(first){ ctx.moveTo(px,py); first=false } else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }

  function mapX(x,xr){ return ( (x + xr) / (2*xr) ) * width + panX }
  function mapY(y,yr){ return (1 - ((y + yr) / (2*yr))) * height + panY }

  // UI and events
  function updateLevelInfo(){
    document.getElementById('level').textContent = level;
    document.getElementById('levelDesc').textContent = target.desc||'';
  }

  function newLevel(){
    target = generateTarget(level);
    // ensure target has fn
    if(!target.fn && target.expr){ try{ target.fn = new Function('x','with(Math){return '+target.expr+'}'); }catch(e){ target.fn = (x)=>0 } }
    document.getElementById('message').textContent='';
    document.getElementById('queryTableBody').innerHTML='';
    queryHistory.length=0;
    panX = 0; panY = 0;
    updateLevelInfo(); draw();
  }

  function queryX(){
    const tx = document.getElementById('queryX').value.trim();
    if(tx==='') return;
    let x = Number(tx);
    if(isNaN(x)){
      setMessage('Invalid x'); return;
    }
    let y;
    try{ y = target.fn(x); if(!isFinite(y)) y = '∞' }catch(e){ y='error' }
    queryHistory.unshift({x, y});
    if(queryHistory.length>30) queryHistory.pop();
    updateQueryTable();
    document.getElementById('queryX').value = '';
    draw();
  }

  function updateQueryTable(){
    const tbody = document.getElementById('queryTableBody');
    tbody.innerHTML = '';
    queryHistory.forEach(({x,y})=>{
      const row = document.createElement('tr');
      const yDisplay = y === '∞' ? '\\infty' : (y === 'error' ? '\\text{error}' : y);
      row.innerHTML = `<td>$$${x}$$</td><td>$$${yDisplay}$$</td>`;
      tbody.appendChild(row);
    });
    // Trigger MathJax to render
    if(window.MathJax) MathJax.typesetPromise([tbody]).catch(err => console.log(err));
  }

  function setMessage(s,err){
    const el=document.getElementById('message'); 
    el.textContent=s; 
    el.style.color = err? '#dc2626':'#059669';
    el.style.backgroundColor = err? '#fee2e2':'#ecfdf5';
    if(window.MathJax) MathJax.typesetPromise([el]).catch(err => console.log(err));
  }

  function submitGuess(){
    const expr = document.getElementById('guessInput').value.trim();
    const userFn = parseUserExpr(expr);
    if(!userFn){ setMessage('Invalid function expression',true); return }
    // compare at random sample points
    const tests = 8; let ok=true; for(let i=0;i<tests;i++){ const x = (Math.random()*2-1)*xRange; let a,b; try{ a=target.fn(x); b=userFn(x); }catch(e){ ok=false; break } if(!isFinite(a) || !isFinite(b) || Math.abs(a-b)>Math.max(0.0001, Math.abs(a)*0.05+0.2)){ ok=false; break }}
    if(ok){ setMessage('Correct! advancing level.'); level++; queryHistory.length=0; document.getElementById('guessInput').value=''; setTimeout(newLevel,900); }
    else setMessage('Not correct yet. Use queries or adjust your guess.',true);
    draw();
  }

  function reveal(){ 
    const el = document.getElementById('message');
    el.textContent = '';
    el.innerHTML = `$$f(x) = ${target.expr}$$`;
    el.style.color = '#3b82f6';
    el.style.backgroundColor = '#dbeafe';
    if(window.MathJax) MathJax.typesetPromise([el]).catch(err => console.log(err));
    draw(); 
  }

  function updateLatexPreview(){
    const input = document.getElementById('guessInput').value.trim();
    const preview = document.getElementById('latexPreview');
    if(input){
      const withFractions = toLatexFraction(input);
      preview.innerHTML = `$$f(x) = ${withFractions}$$`;
    } else {
      preview.innerHTML = `$$f(x) = $$`;
    }
    if(window.MathJax) MathJax.typesetPromise([preview]).catch(err => console.log(err));
  }

  function wire(){
    document.getElementById('queryBtn').addEventListener('click',queryX);
    document.getElementById('queryX').addEventListener('keydown',e=>{ if(e.key==='Enter') queryX() });
    document.getElementById('submitGuess').addEventListener('click',submitGuess);
    document.getElementById('revealBtn').addEventListener('click',reveal);
    document.getElementById('nextBtn').addEventListener('click', ()=>{ level++; newLevel(); });
    document.getElementById('rangeX').addEventListener('input', e=>{ xRange = Number(e.target.value); document.getElementById('rangeValue').textContent = xRange; draw(); });
    document.getElementById('showGrid').addEventListener('change', draw);
    document.getElementById('showNumbers').addEventListener('change', e=>{ showNumbers = e.target.checked; draw(); });
    document.getElementById('showQueryPoints').addEventListener('change', e=>{ showQueryPoints = e.target.checked; draw(); });
    const guessInput = document.getElementById('guessInput'); 
    guessInput.addEventListener('input', ()=>{ 
      updateLatexPreview();
      draw(); 
    });
    
    // Mouse panning
    canvas.addEventListener('mousedown', (e)=>{
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', (e)=>{
      if(isDragging){
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        panX += deltaX;
        panY += deltaY;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        draw();
      } else {
        canvas.style.cursor = 'grab';
      }
    });
    canvas.addEventListener('mouseup', ()=>{
      isDragging = false;
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('mouseleave', ()=>{
      isDragging = false;
      canvas.style.cursor = 'default';
    });
    
    // Formula builder buttons
    document.querySelectorAll('.formula-btn').forEach(btn => {
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        let insert = btn.getAttribute('data-insert');
        const input = document.getElementById('guessInput');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        // Keep LaTeX notation for input field (don't convert ^ to **)
        // Just insert as-is for LaTeX format
        input.value = text.substring(0, start) + insert + text.substring(end);
        input.selectionStart = input.selectionEnd = start + insert.length;
        input.focus();
        updateLatexPreview();
        draw();
      });
    });
    
    window.addEventListener('resize', ()=>{ /* responsive if canvas changed */ });
  }

  // Initialize
  window.addEventListener('load', ()=>{
    setupCanvas(); wire(); newLevel();
    // Render MathJax for page elements
    if(window.MathJax) {
      MathJax.typesetPromise().catch(err => console.log(err));
    }
  });

})();
