(function(root){'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 class Store{
  constructor({maxRows=20,maxBytes=20000000}={}){this.maxRows=maxRows;this.maxBytes=maxBytes;this.rows=[];this.current=null;this.locked=false;this.bytes=0;}
  begin(config){if(this.locked)throw new Error('Finish current row before changing Y or parameters');if(this.rows.length>=this.maxRows)throw new Error('Row history capacity reached; export before creating more rows');this.current=copy(config);return copy(this.current);}
  lock(){if(!this.current)throw new Error('No configured row');this.locked=true;}
  finish(snapshot){if(!this.current)throw new Error('No row');const text=JSON.stringify({...snapshot,config:this.current,id:this.rows.length+1});if(this.rows.length>=this.maxRows||this.bytes+text.length*2>this.maxBytes)throw new Error('Row history capacity reached; export current data');const row=JSON.parse(text);this.rows.push(row);this.bytes+=text.length*2;this.locked=false;this.current=null;return copy(row);}
  list(){return copy(this.rows);}
 }
 const api={Store};root.XZRows=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
