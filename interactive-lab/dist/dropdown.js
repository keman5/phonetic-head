// Shared listbox: focus stays on the trigger; the popup lives in the top layer.
class LabSelect extends HTMLElement {
  connectedCallback(){
    if(this.trigger)return;
    const options=[...this.querySelectorAll('option')].map(o=>({value:o.value,label:o.textContent,selected:o.hasAttribute('selected')}));
    const label=this.getAttribute('aria-label')||document.querySelector(`label[for="${this.id}"]`)?.textContent||this.closest('label')?.childNodes[0]?.textContent||this.id;
    this.classList.add('custom-select');
    this.innerHTML='<button type="button" class="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span></span><i aria-hidden="true"></i></button><div class="select-menu" role="listbox" popover="manual"></div>';
    this.trigger=this.querySelector('button');this.menu=this.querySelector('.select-menu');
    this.trigger.setAttribute('aria-label',label.trim());this.menu.setAttribute('aria-label',label.trim());
    this.menu.id=this.id+'-listbox';this.trigger.setAttribute('aria-controls',this.menu.id);
    this.trigger.disabled=this.hasAttribute('disabled');this.setOptions(options);
    this.trigger.onclick=()=>this.open?this.close():this.show();
    this.trigger.onkeydown=e=>this.keydown(e);
    this.abort=new AbortController();const signal=this.abort.signal;
    document.addEventListener('pointerdown',e=>{if(!this.contains(e.target))this.close();},{signal});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.close();},{signal});
    window.addEventListener('resize',()=>this.close(),{signal});
    window.addEventListener('scroll',e=>{if(this.open&&!this.menu.contains(e.target))this.position();},{capture:true,signal});
  }
  disconnectedCallback(){this.abort?.abort();}
  get value(){return this._value;}
  set value(v){if(!this.options?.some(o=>o.value===v))return;this._value=v;this.renderSelection();}
  get disabled(){return this.hasAttribute('disabled');}
  set disabled(v){this.toggleAttribute('disabled',!!v);if(this.trigger)this.trigger.disabled=!!v;if(v)this.close();}
  setOptions(items){
    this.close();this.options=items.map(o=>Array.isArray(o)?{value:o[0],label:o[1]}:o);
    this._value=this.options.find(o=>o.selected)?.value||this.options[0]?.value||'';
    this.menu.replaceChildren(...this.options.map((o,i)=>{
      const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.id=this.id+'-option-'+i;b.role='option';b.dataset.value=o.value;b.textContent=o.label;
      b.onclick=()=>this.choose(i);return b;
    }));this.renderSelection();
  }
  renderSelection(){
    this.trigger.querySelector('span').textContent=this.options.find(o=>o.value===this.value)?.label||'请选择';
    [...this.menu.children].forEach((b,i)=>b.setAttribute('aria-selected',String(this.options[i].value===this.value)));
  }
  show(){
    if(this.disabled||!this.options.length)return;
    document.querySelectorAll('lab-select').forEach(s=>{if(s!==this)s.close();});
    this.position();this.menu.showPopover();this.open=true;this.trigger.setAttribute('aria-expanded','true');
    this.highlight(Math.max(0,this.options.findIndex(o=>o.value===this.value)));
  }
  position(){
    const r=this.trigger.getBoundingClientRect(),below=innerHeight-r.bottom-12,above=r.top-12;
    const height=Math.min(300,Math.max(below,above));
    Object.assign(this.menu.style,{width:Math.min(Math.max(r.width,180),innerWidth-24)+'px',maxHeight:height+'px',left:Math.max(12,Math.min(r.left,innerWidth-Math.max(r.width,180)-12))+'px',top:below>=Math.min(240,above)?r.bottom+6+'px':'auto',bottom:below>=Math.min(240,above)?'auto':innerHeight-r.top+6+'px'});
  }
  close(){if(!this.menu)return;this.menu.hidePopover();this.open=false;this.trigger.setAttribute('aria-expanded','false');this.trigger.removeAttribute('aria-activedescendant');}
  highlight(i){this.active=(i+this.options.length)%this.options.length;[...this.menu.children].forEach((b,j)=>b.classList.toggle('highlighted',j===this.active));const b=this.menu.children[this.active];this.trigger.setAttribute('aria-activedescendant',b.id);if(b.offsetTop<this.menu.scrollTop)this.menu.scrollTop=b.offsetTop;else if(b.offsetTop+b.offsetHeight>this.menu.scrollTop+this.menu.clientHeight)this.menu.scrollTop=b.offsetTop+b.offsetHeight-this.menu.clientHeight;}
  choose(i){const changed=this.value!==this.options[i].value;this.value=this.options[i].value;this.close();this.trigger.focus();if(changed)this.dispatchEvent(new Event('change',{bubbles:true}));}
  keydown(e){
    if(e.key==='Tab'){this.close();return;}
    if(e.key==='Escape'){e.preventDefault();this.close();return;}
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)){
      e.preventDefault();if(!this.open){this.show();return;}
      if(e.key==='Enter'||e.key===' '){this.choose(this.active);return;}
      this.highlight(e.key==='Home'?0:e.key==='End'?this.options.length-1:this.active+(e.key==='ArrowDown'?1:-1));
    }else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){
      if(!this.open)this.show();this.search=(Date.now()-(this.searchTime||0)>600?'':this.search||'')+e.key.toLowerCase();this.searchTime=Date.now();
      const i=this.options.findIndex(o=>o.label.toLowerCase().startsWith(this.search));if(i>=0)this.highlight(i);
    }
  }
}
customElements.define('lab-select',LabSelect);
