(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))e(t);new MutationObserver(t=>{for(const a of t)if(a.type==="childList")for(const s of a.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&e(s)}).observe(document,{childList:!0,subtree:!0});function o(t){const a={};return t.integrity&&(a.integrity=t.integrity),t.referrerPolicy&&(a.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?a.credentials="include":t.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function e(t){if(t.ep)return;t.ep=!0;const a=o(t);fetch(t.href,a)}})();const d=document.getElementById("app");if(!d)throw new Error("Missing #app root element");d.innerHTML=`
  <div class="layout" id="layout">
    <!-- Left Panel: Integration Wizard (embedded from port 3002) -->
    <aside class="panel panel--left" id="panel-left">
      <button class="panel-toggle" id="toggle-left" title="Toggle wizard panel">&#8249;</button>
      <div class="panel-content panel-content--iframe">
        <iframe
          id="wizard-frame"
          title="Integration Wizard"
          src="http://localhost:3002"
          style="width:100%;height:100%;border:none;display:block;"
          allow="clipboard-write"
        ></iframe>
      </div>
    </aside>

    <!-- Center Panel: Demo Store -->
    <main class="panel panel--center">
      <section class="frame-card">
        <div class="card-header" style="display:flex;align-items:center;gap:10px;">
          <h2>Demo Store</h2>
          <span class="hint">Customer journey view</span>
          <button id="store-refresh-btn" title="Refresh store only" style="margin-left:auto;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px;white-space:nowrap;">&#x21BB; Refresh Store</button>
        </div>
        <iframe id="store-frame" title="Demo Store" src="http://localhost:3001" allow="microphone; camera; clipboard-write"></iframe>
      </section>
    </main>

    <!-- Right Panel: Dashboard -->
    <aside class="panel panel--right" id="panel-right">
      <button class="panel-toggle" id="toggle-right" title="Toggle dashboard panel">&#8250;</button>
      <div class="panel-content">
        <section class="frame-card">
          <div class="card-header">
            <h2>Dashboard</h2>
            <span class="hint">Backend analysis + intervention feed</span>
          </div>
          <iframe id="dashboard-frame" title="Dashboard" src="http://localhost:3000"></iframe>
        </section>
      </div>
    </aside>
  </div>
`;function p(r,n,o){const e=document.getElementById(r),t=document.getElementById(n),a=document.getElementById("layout");if(!e||!t||!a)return;const s=`ava-demo-panel-${o}`,l=o==="left"?"‹":"›",c=o==="left"?"›":"‹";localStorage.getItem(s)==="collapsed"?(e.classList.add("collapsed"),t.innerHTML=c):t.innerHTML=l,t.addEventListener("click",()=>{const f=e.classList.contains("collapsed");a.classList.add("transitioning"),setTimeout(()=>a.classList.remove("transitioning"),320),f?(e.classList.remove("collapsed"),t.innerHTML=l,localStorage.setItem(s,"expanded")):(e.classList.add("collapsed"),t.innerHTML=c,localStorage.setItem(s,"collapsed"))})}p("panel-left","toggle-left","left");p("panel-right","toggle-right","right");const g=window.matchMedia("(max-width: 1080px)");function m(r){const n=document.getElementById("panel-left"),o=document.getElementById("panel-right"),e=document.getElementById("toggle-left"),t=document.getElementById("toggle-right");if(r.matches)n==null||n.classList.add("collapsed"),o==null||o.classList.add("collapsed"),e&&(e.innerHTML="›"),t&&(t.innerHTML="‹");else{const a=localStorage.getItem("ava-demo-panel-left"),s=localStorage.getItem("ava-demo-panel-right");a!=="collapsed"&&(n==null||n.classList.remove("collapsed"),e&&(e.innerHTML="‹")),s!=="collapsed"&&(o==null||o.classList.remove("collapsed"),t&&(t.innerHTML="›"))}}g.addEventListener("change",m);m(g);const u=()=>document.getElementById("wizard-frame"),i=()=>document.getElementById("store-frame"),h=()=>document.getElementById("dashboard-frame");const refreshBtn=document.getElementById("store-refresh-btn");refreshBtn&&refreshBtn.addEventListener("click",()=>{const f=i();if(f){f.contentWindow?.postMessage({type:"ava:reset-welcome"},"http://localhost:3001");const s=f.src;f.src="";setTimeout(()=>{f.src=s;},30);}});window.addEventListener("message",r=>{if(!["http://localhost:3001","http://localhost:3002","http://localhost:3000",window.location.origin].includes(r.origin)&&r.origin!=="")return;const o=r.data;if(!(!o||typeof o!="object")){if(o.type==="ava:proxy:to-store"){const e=i();e!=null&&e.contentWindow&&e.contentWindow.postMessage(o.payload,"*");return}if(o.source==="ava-store-scenario"||o.type==="ava:store:scenario-result"||o.type==="ava:store:ready"){const e=u();e!=null&&e.contentWindow&&e.contentWindow.postMessage(o,"*");return}if(o.type==="ava:wizard:reset"){const e=i();e&&(e.src=e.src);return}if(o.type==="ava:wizard:activated"){const e=h();e!=null&&e.contentWindow&&e.contentWindow.postMessage({type:"ava:activate"},"*");const t=i();t&&(t.src=t.src);return}}});
