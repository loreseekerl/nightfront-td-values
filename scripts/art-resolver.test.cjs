"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resolverSource = fs.readFileSync(path.join(__dirname,"..","art-resolver.js"),"utf8");
const NORMAL = "123456789012";
const SHINY = "123456789013";
const normalPath = "./assets/roblox-units/"+NORMAL+".png";
const shinyPath = "./assets/roblox-units/"+SHINY+".png";

function manifests(overrides={}) {
  return {
    source: {
      schemaVersion:1,
      snapshotId:9,
      units:[{name:"Bonnie",rarity:"Uncommon",image_asset_id:NORMAL,shiny_image_asset_id:SHINY}],
      ...overrides.source
    },
    exported: {
      sourceSnapshotId:9,
      assets:{
        [NORMAL]:{state:"ready",path:normalPath.slice(2)},
        [SHINY]:{state:"ready",path:shinyPath.slice(2)}
      },
      ...overrides.exported
    }
  };
}

function browser() {
  let nextTimer = 1;
  const timers = new Map();
  const requests = [];
  const state = {fetchImpl:async ()=>{throw new Error("No fetch fixture");}};
  const window = {};
  const context = vm.createContext({
    window,AbortController,
    fetch:(url,options)=>{
      requests.push({url,options});
      return state.fetchImpl(url,options);
    },
    setTimeout:(callback,delay)=>{
      const id = nextTimer++;
      timers.set(id,{callback,delay});
      return id;
    },
    clearTimeout:id=>timers.delete(id)
  });
  vm.runInContext(resolverSource,context,{filename:"art-resolver.js"});
  return {
    hydrate:window.NightfrontArt.hydrate,requests,timers,
    respond:fixture=>{
      state.fetchImpl = async url=>({
        ok:true,json:async ()=>url.includes("art-sync") ? fixture.source : fixture.exported
      });
    },
    fetchWith:fn=>{state.fetchImpl=fn;},
    expire:()=>{
      assert.equal(timers.size,1,"one timeout should bound a shared manifest load");
      const {callback,delay} = timers.values().next().value;
      assert.ok(delay>0 && delay<=5000,"optional artwork must have a short bounded wait");
      callback();
    }
  };
}

function blankUnit() {
  return {name:"Bonnie",rarity:"Uncommon",image_url:null,shiny_image_url:null};
}

test("temporary fetch failure leaves units usable and the next refresh retries",async ()=>{
  const page = browser();
  page.fetchWith(async ()=>{throw new Error("Temporary network failure");});
  const first = [blankUnit()];
  assert.equal(await page.hydrate(first),first);
  assert.equal(first[0].image_url,null);
  assert.equal(page.timers.size,0);
  assert.ok(page.requests.every(request=>request.options.signal.aborted));

  page.respond(manifests());
  const second = [blankUnit()];
  await page.hydrate(second);
  assert.equal(second[0].image_url,normalPath);
  assert.equal(second[0].shiny_image_url,shinyPath);
  assert.equal(page.requests.length,4);
  await page.hydrate([blankUnit()]);
  assert.equal(page.requests.length,4,"successful metadata may remain cached");
  assert.equal(page.timers.size,0);
});

test("HTTP errors can recover through refresh",async ()=>{
  const page = browser();
  page.fetchWith(async ()=>({ok:false}));
  await page.hydrate([blankUnit()]);
  page.respond(manifests());
  const units = [blankUnit()];
  await page.hydrate(units);
  assert.equal(units[0].image_url,normalPath);
  assert.equal(page.requests.length,4);
});

test("a hung fetch times out, aborts both requests and releases concurrent unit loads",async ()=>{
  const page = browser();
  page.fetchWith(()=>new Promise(()=>{}));
  const first = [blankUnit()];
  const second = [blankUnit()];
  const pending = [page.hydrate(first),page.hydrate(second)];
  assert.equal(page.requests.length,2,"concurrent callers should share one manifest load");
  page.expire();
  const result = await Promise.all(pending);
  assert.equal(result[0],first);
  assert.equal(result[1],second);
  assert.equal(first[0].image_url,null);
  assert.ok(page.requests.every(request=>request.options.signal.aborted));
  assert.equal(page.timers.size,0);
  page.respond(manifests());
  await page.hydrate(first);
  assert.equal(first[0].image_url,normalPath,"refresh should retry after a timeout");
});

test("the timeout also bounds a stalled JSON response body",async ()=>{
  const page = browser();
  let bodyReads = 0;
  page.fetchWith(async ()=>({ok:true,json:()=>{
    bodyReads++;
    return new Promise(()=>{});
  }}));
  const units = [blankUnit()];
  const pending = page.hydrate(units);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bodyReads,2);
  page.expire();
  assert.equal(await pending,units);
  assert.equal(units[0].image_url,null);
  assert.equal(page.timers.size,0);
});

test("mismatched snapshots remain excluded and can recover on refresh",async ()=>{
  const page = browser();
  page.respond(manifests({exported:{sourceSnapshotId:10}}));
  const units = [blankUnit()];
  await page.hydrate(units);
  assert.equal(units[0].image_url,null);
  assert.equal(units[0].shiny_image_url,null);
  page.respond(manifests());
  await page.hydrate(units);
  assert.equal(units[0].image_url,normalPath);
  assert.equal(page.requests.length,4);
});

test("owner portraits and market fields survive normal and shiny hydration",async ()=>{
  const page = browser();
  page.respond(manifests());
  const unit = {
    name:"Bonnie",rarity:"Uncommon",id:"owner-unit",value:100,shiny_value:200,
    demand:"5/10",image_url:"https://owner.example/bonnie.png",
    shiny_image_url:"https://owner.example/shiny-bonnie.png"
  };
  const before = structuredClone(unit);
  await page.hydrate([unit]);
  assert.deepEqual(unit,before);

  const normalOnly = {...blankUnit(),image_url:unit.image_url};
  await page.hydrate([normalOnly]);
  assert.equal(normalOnly.image_url,unit.image_url);
  assert.equal(normalOnly.shiny_image_url,shinyPath);
});

test("identity, rarity, same-asset shiny and path safeguards remain enforced",async ()=>{
  const page = browser();
  const fixture = manifests();
  fixture.source.units[0].shiny_image_asset_id = NORMAL;
  fixture.source.units.push({
    name:"Toy Bonnie",rarity:"Epic",image_asset_id:SHINY,shiny_image_asset_id:null
  });
  fixture.exported.assets[SHINY].path = "../owner-portraits/bonnie.png";
  page.respond(fixture);
  const matching = blankUnit();
  const wrongCase = {...blankUnit(),name:"bonnie"};
  const wrongRarity = {...blankUnit(),rarity:"Secret"};
  const unrelated = {...blankUnit(),name:"Jester Toy Bonnie",rarity:"Epic"};
  const unsafePath = {...blankUnit(),name:"Toy Bonnie",rarity:"Epic"};
  await page.hydrate([matching,wrongCase,wrongRarity,unrelated,unsafePath]);
  assert.equal(matching.image_url,normalPath);
  assert.equal(matching.shiny_image_url,null,"normal artwork is not distinct shiny artwork");
  for (const unit of [wrongCase,wrongRarity,unrelated,unsafePath])
    assert.equal(unit.image_url,null);
});

test("placeholder exports never fill unit portraits",async ()=>{
  const page = browser();
  const fixture = manifests();
  fixture.exported.assets[NORMAL].state = "generic_placeholder";
  fixture.exported.assets[SHINY].state = "ambiguous_source_asset";
  page.respond(fixture);
  const units = [blankUnit()];
  await page.hydrate(units);
  assert.equal(units[0].image_url,null);
  assert.equal(units[0].shiny_image_url,null);
});
