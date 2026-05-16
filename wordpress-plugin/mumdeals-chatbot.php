<?php
/*
Plugin Name: MumDeals Chatbot
Description: AI deals chatbot
Version: 1.2
*/
if(!defined("ABSPATH"))exit;
function md_chatbot(){
ob_start();
?>
<style>
#mdc-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:#e91e8c;color:white;border:none;cursor:pointer;z-index:9999;font-size:14px;font-weight:700;box-shadow:0 4px 20px rgba(233,30,140,0.4)}
#mdc-win{position:fixed;bottom:90px;right:24px;width:340px;height:480px;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.2);z-index:9998;display:none;flex-direction:column;overflow:hidden;font-family:sans-serif}
#mdc-hdr{background:#e91e8c;color:white;padding:16px;display:flex;align-items:center;justify-content:space-between}
#mdc-cls{background:none;border:none;color:white;cursor:pointer;font-size:20px;padding:0}
#mdc-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.mdc-m{max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5}
.mdc-bot{background:#f3f4f6;color:#111;align-self:flex-start}
.mdc-usr{background:#e91e8c;color:white;align-self:flex-end}
.mdc-t{display:flex;gap:4px;padding:10px 14px;background:#f3f4f6;border-radius:12px;align-self:flex-start}
.mdc-t span{width:6px;height:6px;background:#9ca3af;border-radius:50%;animation:bop 1.2s infinite}
.mdc-t span:nth-child(2){animation-delay:.2s}
.mdc-t span:nth-child(3){animation-delay:.4s}
@keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}
.mdc-qs{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.mdc-q{background:white;border:1px solid #e91e8c;color:#e91e8c;padding:5px 10px;border-radius:20px;font-size:11px;cursor:pointer}
#mdc-foot{padding:12px;border-top:1px solid #e5e7eb;display:flex;gap:8px}
#mdc-inp{flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:20px;font-size:13px;outline:none}
#mdc-snd{background:#e91e8c;color:white;border:none;border-radius:20px;padding:8px 16px;cursor:pointer;font-size:13px}
#mdc-exit{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:none;align-items:center;justify-content:center}
#mdc-ebox{background:white;border-radius:16px;padding:32px;max-width:380px;width:90%;text-align:center}
#mdc-eemail{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box}
#mdc-esub{width:100%;padding:12px;background:#e91e8c;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
#mdc-eno{background:none;border:none;color:#9ca3af;font-size:13px;cursor:pointer;margin-top:8px;display:block;width:100%}
</style>
<div id="mdc-exit"><div id="mdc-ebox">
<h3 style="margin:0 0 8px;font-size:20px;color:#111">Wait! Before you go...</h3>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px">Get our best UK deals every Monday. Free.</p>
<input type="email" id="mdc-eemail" placeholder="Your email address"/>
<button id="mdc-esub">Get Weekly Deals</button>
<button id="mdc-eno">No thanks</button>
</div></div>
<button id="mdc-btn">Chat</button>
<div id="mdc-win">
<div id="mdc-hdr">
<div style="font-weight:600;font-size:14px">MumDeals Advisor</div>
<button id="mdc-cls">X</button>
</div>
<div id="mdc-msgs"></div>
<div id="mdc-foot">
<input id="mdc-inp" placeholder="Ask me about deals..."/>
<button id="mdc-snd">Send</button>
</div></div>
<script>
(function(){
var API="https://backend-production-c3f5.up.railway.app";
var hist=[],opened=false,exitShown=false,subscribed=localStorage.getItem("md_sub");
var btn=document.getElementById("mdc-btn");
var win=document.getElementById("mdc-win");
var msgs=document.getElementById("mdc-msgs");
var inp=document.getElementById("mdc-inp");
var exitEl=document.getElementById("mdc-exit");
function getCat(){var u=window.location.href;if(u.indexOf("baby")>-1||u.indexOf("parenting")>-1)return"Baby & Parenting";if(u.indexOf("home")>-1||u.indexOf("garden")>-1)return"Home & Garden";if(u.indexOf("tech")>-1)return"Tech & AI Tools";if(u.indexOf("health")>-1)return"Health & Wellness";if(u.indexOf("finance")>-1||u.indexOf("insurance")>-1)return"Finance & Insurance";if(u.indexOf("travel")>-1)return"Travel & Outdoors";if(u.indexOf("pet")>-1)return"Pet Care";return"general";}
function addMsg(txt,role){var d=document.createElement("div");d.className="mdc-m "+role;d.innerHTML=txt.replace(/\n/g,"<br>");msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}
function addTyping(){var d=document.createElement("div");d.className="mdc-t";d.innerHTML="<span></span><span></span><span></span>";msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;}
function addQuick(opts){var w=document.createElement("div");w.className="mdc-qs";opts.forEach(function(o){var b=document.createElement("button");b.className="mdc-q";b.textContent=o;b.onclick=function(){send(o);w.remove();};w.appendChild(b);});msgs.appendChild(w);msgs.scrollTop=msgs.scrollHeight;}
function greet(){var g="Hi! I am your MumDeals Advisor. What are you shopping for today?";setTimeout(function(){addMsg(g,"mdc-bot");addQuick(["Baby products","Home deals","Tech deals","Travel deals","Best deals today"]);},500);}
async function send(txt){if(!txt||!txt.trim())return;inp.value="";addMsg(txt,"mdc-usr");var t=addTyping();hist.push({role:"user",content:txt});try{var r=await fetch(API+"/chatbot/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:txt,history:hist.slice(-6),pageUrl:window.location.href,pageCategory:getCat()})});var data=await r.json();t.remove();var reply=data.reply||"Sorry, try asking about our deals!";hist.push({role:"assistant",content:reply});addMsg(reply,"mdc-bot");if(hist.length>=4&&!subscribed){setTimeout(function(){addMsg("Want deals every Monday? Subscribe free!","mdc-bot");addQuick(["Yes subscribe me","Show more deals"]);},800);}}catch(e){t.remove();addMsg("Sorry, something went wrong!","mdc-bot");}}
btn.onclick=function(){if(win.style.display==="flex"){win.style.display="none";}else{win.style.display="flex";if(!opened){opened=true;greet();}}};
document.getElementById("mdc-cls").onclick=function(){win.style.display="none";};
document.getElementById("mdc-snd").onclick=function(){send(inp.value);};
inp.onkeypress=function(e){if(e.key==="Enter")send(inp.value);};
if(!subscribed){document.addEventListener("mouseleave",function(e){if(e.clientY<10&&!exitShown){exitShown=true;exitEl.style.display="flex";}});}
document.getElementById("mdc-eno").onclick=function(){exitEl.style.display="none";};
document.getElementById("mdc-esub").onclick=async function(){var em=document.getElementById("mdc-eemail").value;if(!em||em.indexOf("@")<0){alert("Please enter a valid email");return;}try{await fetch(API+"/subscribers/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em,source:"exit-intent"})});localStorage.setItem("md_sub","1");exitEl.style.display="none";subscribed=true;alert("Subscribed! Best UK deals every Monday.");}catch(e){alert("Sorry, something went wrong.");}};
setTimeout(function(){if(!opened){win.style.display="flex";opened=true;greet();}},8000);
})();
</script>
<?php
ob_end_flush();
}
add_action("wp_footer","md_chatbot");