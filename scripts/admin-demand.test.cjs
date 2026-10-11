"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const adminSource = fs.readFileSync(path.join(__dirname,"..","admin.js"),"utf8");

async function dashboard({signedIn=true}={}) {
  const elements = new Map();
  const writes = [];
  const uploads = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id,{
      value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,checked:false,
      files:[],listeners:{},classList:{toggle(){},add(){},remove(){}},
      addEventListener(type,handler){this.listeners[type]=handler;},
      setAttribute(){},reset(){},focus(){},scrollIntoView(){},replaceChildren(){},append(){},
      querySelector(){return element(id+":child");}
    });
    return elements.get(id);
  };
  const defaults = {
    adminUnitName:"Bonnie",adminUnitRarity:"Uncommon",adminUnitValue:"123",
    adminUnitShinyValue:"456",adminNormalValueStatus:"Estimated",
    adminShinyValueStatus:"Estimated",adminNormalEvidence:"owner source kept",
    adminShinyEvidence:"shiny source kept",adminUnitImage:"https://owner.example/bonnie.png",
    adminUnitShinyImage:"https://owner.example/shiny-bonnie.png"
  };
  for (const [id,value] of Object.entries(defaults)) element(id).value=value;
  const client = {
    auth:{
      onAuthStateChange(){},
      async getSession(){return {data:{session:signedIn ? {user:{id:"owner",email:"owner@example.test"}} : null}};}
    },
    from(table){
      const query = {
        select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
        async maybeSingle(){return {data:table==="qa_editors"?{user_id:"owner"}:null};},
        insert(fields){writes.push({table,fields:JSON.parse(JSON.stringify(fields))});return this;},
        update(fields){writes.push({table,fields:JSON.parse(JSON.stringify(fields))});return this;},
        async single(){return {data:{id:"saved-unit"}};},
        then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}
      };
      return query;
    },
    storage:{from(){return {
      async upload(name,file){uploads.push({name,file});return {data:{path:name}};},
      getPublicUrl(){return {data:{publicUrl:"https://owner.example/uploaded.png"}};}
    };}}
  };
  const context = vm.createContext({
    document:{getElementById:element,createElement:()=>element("new")},
    location:{search:"?admin=1",href:"https://example.test/?admin=1"},URL,URLSearchParams,
    SUPABASE_URL:"https://example.test",SUPABASE_PUBLISHABLE_KEY:"public-test-key",
    window:{supabase:{createClient:()=>client}}
  });
  vm.runInContext(adminSource,context,{filename:"admin.js"});
  await new Promise(resolve=>setImmediate(resolve));
  if (signedIn) assert.match(element("adminStatus").textContent,/Owner verified/);
  return {
    element,writes,uploads,
    async save(normal,shiny,{withUpload=false}={}) {
      element("adminUnitDemand").value=normal;
      element("adminUnitShinyDemand").value=shiny;
      if (withUpload) element("adminNormalFile").files=[{name:"bonnie.png",type:"image/png",size:100}];
      await element("adminUnitForm").listeners.submit({preventDefault(){}});
      return element("adminStatus").textContent;
    }
  };
}

test("normal and shiny ratings normalize independently without changing prices or owner portraits",async ()=>{
  const page = await dashboard();
  await page.save("  +0007.500 / 10  ",".25");
  assert.equal(page.writes.length,1);
  assert.deepEqual(page.writes[0],{
    table:"units",
    fields:{
      name:"Bonnie",rarity:"Uncommon",value:123,shiny_value:456,demand:"7.5/10",shiny_demand:"0.25/10",
      normal_value_status:"Estimated",shiny_value_status:"Estimated",
      normal_value_evidence:"owner source kept",shiny_value_evidence:"shiny source kept",
      released_on:null,image_url:"https://owner.example/bonnie.png",shiny_image_url:"https://owner.example/shiny-bonnie.png"
    }
  });
  assert.equal(page.uploads.length,0);
});

test("zero, ten, bare scores and tiny decimal scores remain exact",async ()=>{
  const cases = [
    ["0","10","0/10","10/10"],
    ["1","10.000 / 10","1/10","10/10"],
    ["0.0000000000000000001","+000.5000/10","0.0000000000000000001/10","0.5/10"]
  ];
  for (const [normal,shiny,expectedNormal,expectedShiny] of cases) {
    const page = await dashboard();
    await page.save(normal,shiny);
    assert.equal(page.writes[0].fields.demand,expectedNormal);
    assert.equal(page.writes[0].fields.shiny_demand,expectedShiny);
  }
});

test("unknown demand becomes null and descriptive labels remain compatible",async ()=>{
  for (const [normal,shiny,expectedNormal,expectedShiny] of [
    ["","  unknown  ",null,null],
    ["n/A","NA",null,null],
    [" Medium ","Very High","Medium","Very High"]
  ]) {
    const page = await dashboard();
    await page.save(normal,shiny);
    assert.equal(page.writes[0].fields.demand,expectedNormal);
    assert.equal(page.writes[0].fields.shiny_demand,expectedShiny);
  }
});

test("out-of-range and malformed ratings stop both writes and uploads for each variant",async ()=>{
  const invalid = [
    "11/10","-1","123/10","10.0000000000000001","5/100","1e1","1e-7",
    "NaN","+NaN","-NaN","Inf","+Inf","-Inf","Infinity","-Infinity","7/10 extra","7 percent","1,5","0xA",
    "High demand ".repeat(5),"0."+"0".repeat(45)+"1"
  ];
  for (const value of invalid) for (const variant of ["normal","shiny"]) {
    const page = await dashboard();
    const status = await page.save(variant==="normal"?value:"1/10",variant==="shiny"?value:"1/10",{withUpload:true});
    assert.match(status,new RegExp("Save failed: "+(variant==="normal"?"Normal":"Shiny")+" demand"),value);
    assert.equal(page.writes.length,0,value);
    assert.equal(page.uploads.length,0,value);
    assert.equal(page.element("adminSaveUnit").disabled,false);
  }
});

test("an unauthenticated submission still cannot save unit fields",async ()=>{
  const page = await dashboard({signedIn:false});
  const status = await page.save("1/10","2/10");
  assert.match(status,/Owner login required/);
  assert.equal(page.writes.length,0);
});
