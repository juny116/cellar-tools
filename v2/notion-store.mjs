// V2 read adapter only. V1 continues to write through the host's standard Notion MCP.
export class NotionStore {
  constructor({token,dataSourceId,properties={},fetchImpl=fetch}){
    if(!token || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId??''))throw new Error('Notion token and cellar data source ID required');
    this.token=token;this.id=dataSourceId;this.fetch=fetchImpl;
    this.props={title:'#',relation:'Sakes',consumed:'Consumed',note:'Note',volume:'용량',location:'저장위치',productTitle:'Sake name',producer:'Brewery',...properties};
    this.capabilities={backend:'notion',read:true,write:false,atomicCommit:false};
  }
  async request(path,body){
    const r=await this.fetch(`https://api.notion.com/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,'Notion-Version':'2026-03-11','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error(`Notion read failed (${r.status})`);return r.json();
  }
  async listInventory({includeConsumed=false}={}){
    const out=[];let cursor;const products=new Map();const p=this.props;
    const text=x=>(x?.title??x?.rich_text??[]).map(t=>t.plain_text??t.text?.content??'').join('');
    do{
      const data=await this.request(`/data_sources/${this.id}/query`,{page_size:100,...(cursor?{start_cursor:cursor}:{})});
      for(const row of data.results){
        const props=row.properties;
        if(props[p.consumed]?.type!=='checkbox' || props[p.relation]?.type!=='relation')throw new Error('Notion schema mismatch: configure consumed checkbox and catalog relation');
        const status=props[p.consumed].checkbox?'consumed':'available';if(!includeConsumed && status==='consumed')continue;
        const ids=props[p.relation].relation.map(x=>x.id);
        // Surface ambiguous/missing relationships instead of silently selecting one.
        let product=null;
        if(ids.length===1 && !props[p.relation].has_more){
          if(!products.has(ids[0]))products.set(ids[0],await this.request(`/pages/${ids[0]}`));
          const page=products.get(ids[0]);product={name:text(page.properties[p.productTitle]),producer:text(page.properties[p.producer]),sourceUrl:page.url,rawProperties:page.properties};
        }
        out.push({id:row.id,status,title:text(props[p.title]),productIds:ids,product,relationIncomplete:!!props[p.relation].has_more,volumeLabel:props[p.volume]?.select?.name??null,location:text(props[p.location]),note:text(props[p.note]),sourceUrl:row.url});
      }
      cursor=data.has_more?data.next_cursor:null;
      if(data.has_more && !cursor)throw new Error('Notion pagination missing cursor');
    }while(cursor);
    return out;
  }
  getPreferences(){return {likes:[],dislikes:[],notes:'',unavailable:true};}
  prepare(){throw new Error('Notion v2 writes are not implemented; use the v1 workflow');}
  commit(){throw new Error('Notion v2 writes are not implemented; use the v1 workflow');}
  close(){}
}
