"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Boxes, CheckCircle2, ChevronDown, CircleDollarSign, Database, FileSpreadsheet, Filter, History, LayoutDashboard, PackageSearch, Search, Settings, ShieldCheck, Sparkles, Upload, Users, X } from "lucide-react";
import * as XLSX from "xlsx";

type Product = { id:number; productCode:string; name:string; manufacturer:string|null; modelNumber:string|null; category:string|null; rfqName?:string|null; recordDate?:string|null; productUrl?:string|null; description:string|null; reviewStatus:string; sourceType:string };
type Supplier = { id:number; companyName:string; country:string|null; dispatchLocation:string|null; verificationStatus:string };
type Offer = { id:number; productId:number; supplierId:number; unitPrice:number|null; currency:string; vatStatus:string; quotationDate:string|null; stockStatus:string|null; leadTime:string|null; shippingCost:number|null };

const fallbackProducts: Product[] = [
  { id:1, productCode:"DEMO-001", name:"10 L Nitrogen Cylinder", manufacturer:"Vítkovice Cylinders", modelNumber:"10L-200BAR", category:"HVAC & Refrigeration", description:"Empty steel cylinder for technical gases; 200 bar working pressure.", reviewStatus:"verified", sourceType:"internal" },
  { id:2, productCode:"DEMO-002", name:"Digital Power Meter", manufacturer:"Schneider Electric", modelNumber:"PM800", category:"Electrical & Instrumentation", description:"Historical product family record; exact sub-model requires confirmation.", reviewStatus:"review", sourceType:"internal" },
  { id:3, productCode:"DEMO-003", name:"ROAIRVAC 6.0 Vacuum Pump", manufacturer:"Rothenberger", modelNumber:"170063", category:"HVAC & Refrigeration", description:"Two-stage vacuum pump, 142 L/min at 50 Hz.", reviewStatus:"verified", sourceType:"internal" },
  { id:4, productCode:"DEMO-004", name:"Combustible Gas Leak Detector", manufacturer:"JAVAC", modelNumber:"718-202-G21", category:"Test & Measurement", description:"Hydrocarbon and ammonia leak detector with carrying case.", reviewStatus:"verified", sourceType:"internal" },
  { id:5, productCode:"DEMO-005", name:"Voltage Transformer 690/110 V", manufacturer:"KyongBo Electric", modelNumber:"3LL1", category:"Electrical & Instrumentation", description:"Three-phase line-to-line voltage transformer; historical reference only.", reviewStatus:"review", sourceType:"internal" },
];
const fallbackSuppliers: Supplier[] = [
  {id:1,companyName:"Stuart Plumbing",country:"United Kingdom",dispatchLocation:"Leicestershire, UK",verificationStatus:"verified"},
  {id:2,companyName:"Industrial Components Europe",country:"Germany",dispatchLocation:"EU warehouse",verificationStatus:"review"},
  {id:3,companyName:"Gas Bottles Direct",country:"Czech Republic",dispatchLocation:"Prague, CZ",verificationStatus:"verified"},
];
const fallbackOffers: Offer[] = [
  {id:1,productId:1,supplierId:3,unitPrice:86.78,currency:"EUR",vatStatus:"excluded",quotationDate:"2026-10-30",stockStatus:"In stock",leadTime:"3–5 working days",shippingCost:42},
  {id:2,productId:2,supplierId:2,unitPrice:1558.21,currency:"GBP",vatStatus:"excluded",quotationDate:"2026-10-22",stockStatus:"Quote required",leadTime:"To confirm",shippingCost:null},
  {id:3,productId:3,supplierId:1,unitPrice:309,currency:"GBP",vatStatus:"excluded",quotationDate:"2026-11-02",stockStatus:"Available",leadTime:"Same-day dispatch",shippingCost:null},
  {id:4,productId:4,supplierId:1,unitPrice:325.06,currency:"GBP",vatStatus:"excluded",quotationDate:"2026-11-02",stockStatus:"Low stock",leadTime:"Next day",shippingCost:4.99},
];

const nav = [
  ["Smart Search", Search], ["Overview", LayoutDashboard], ["Product Library", Boxes], ["Suppliers", Users],
  ["Alternatives", Sparkles], ["Projects & RFQs", FileSpreadsheet], ["Data Import", Upload], ["Analytics", CircleDollarSign], ["Settings", Settings],
] as const;

function Status({value}:{value:string}) {
  const good = ["verified","Available","In stock"].includes(value);
  return <span className={`status ${good ? "status-good" : value === "review" || value === "Low stock" ? "status-warn" : "status-neutral"}`}>{good && <CheckCircle2 size={12}/>} {value.replaceAll("_"," ")}</span>;
}

export default function Home() {
  const publicReadOnly=process.env.NODE_ENV==="production";
  const [products,setProducts]=useState(fallbackProducts), [suppliers,setSuppliers]=useState(fallbackSuppliers), [offers,setOffers]=useState(fallbackOffers);
  const [query,setQuery]=useState(""), [category,setCategory]=useState("All categories"), [active,setActive]=useState("Smart Search"), [selected,setSelected]=useState<Product|null>(null);
  const [showImport,setShowImport]=useState(false), [paste,setPaste]=useState(""), [notice,setNotice]=useState("");
  const [importRowsData,setImportRowsData]=useState<Array<Record<string,string>>>([]), [importFileName,setImportFileName]=useState(""), [dragging,setDragging]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);

  useEffect(()=>{ fetch("/api/catalog").then(r=>r.ok?r.json():Promise.reject()).then(d=>{setProducts(d.products);setSuppliers(d.suppliers);setOffers(d.offers)}).catch(()=>{}); },[]);
  const categories=useMemo(()=>["All categories",...Array.from(new Set(products.map(p=>p.category).filter(Boolean) as string[]))], [products]);
  const results=useMemo(()=>products.filter(p=>{
    const hay=[p.name,p.manufacturer,p.modelNumber,p.category,p.description].join(" ").toLowerCase();
    return (!query || hay.includes(query.toLowerCase())) && (category==="All categories" || p.category===category);
  }),[products,query,category]);
  const offerFor=(id:number)=>offers.find(o=>o.productId===id);
  const supplierFor=(id?:number)=>suppliers.find(s=>s.id===id);

  function parsePastedRows(){
    const lines=paste.trim().split(/\r?\n/).filter(Boolean); if(lines.length<2)return [];
    const delimiter=lines[0].includes("\t")?"\t":","; const headers=lines[0].split(delimiter).map(x=>x.trim());
    return lines.slice(1).map(line=>Object.fromEntries(line.split(delimiter).map((v,i)=>[headers[i],v.trim()])));
  }

  async function readImportFile(file:File){
    if(!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)){setNotice("Use an .xlsx, .xls, .csv or .tsv file.");return;}
    try{
      const data=await file.arrayBuffer();
      const workbook=XLSX.read(data,{type:"array",cellDates:true});
      const sheet=workbook.Sheets[workbook.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:"",raw:false,dateNF:"yyyy-mm-dd"})
        .map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.trim(),String(value).trim()])))
        .filter(row=>Object.values(row).some(value=>value));
      if(!rows.length){setNotice("The first worksheet contains no data rows.");return;}
      setImportRowsData(rows);setImportFileName(file.name);setNotice(`${rows.length} row(s) read from ${file.name}. Review and import when ready.`);
    }catch{setNotice("The spreadsheet could not be read. Check that the first row contains headers.");}
  }

  function dropFile(event:DragEvent<HTMLDivElement>){event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(file)void readImportFile(file);}

  async function importRows(){
    const rows=importRowsData.length?importRowsData:parsePastedRows(); if(!rows.length){setNotice("Choose a spreadsheet or paste a header row and at least one data row.");return;}
    const res=await fetch("/api/catalog",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fileName:importFileName||"pasted-spreadsheet",rows})});
    const data=await res.json(); if(!res.ok){setNotice(data.error||"Import failed");return;}
    setNotice(`${data.imported} row(s) imported for human review; ${data.skipped} skipped.`); setShowImport(false); setPaste("");setImportRowsData([]);setImportFileName("");
    const refreshed=await fetch("/api/catalog").then(r=>r.json()); setProducts(refreshed.products); setSuppliers(refreshed.suppliers); setOffers(refreshed.offers);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">PL</div><div><strong>Prowling Lions</strong><small>Procurement Intelligence</small></div></div>
      <nav>{nav.filter(([label])=>!publicReadOnly||label!=="Data Import").map(([label,Icon],i)=><button key={label} className={active===label?"active":""} onClick={()=>setActive(label)}><Icon size={17}/><span>{label}</span>{i===0&&<kbd>⌘K</kbd>}</button>)}</nav>
      <div className="sidebar-foot"><ShieldCheck size={17}/><div><strong>Internal workspace</strong><small>Source-traceable records</small></div></div>
    </aside>
    <main>
      <header className="topbar"><div><span className="eyebrow">WORKSPACE</span><strong>Procurement Operations</strong></div><div className="top-actions"><span className="sync"><span/> Database connected</span>{!publicReadOnly&&<button className="secondary" onClick={()=>setShowImport(true)}><Upload size={15}/> Import data</button>}<div className="avatar">CW</div></div></header>
      <section className="content">
        <div className="page-title"><div><span className="eyebrow">SMART SEARCH</span><h1>Find what your team already knows.</h1><p>Search products, model numbers, specifications, suppliers and historical quotations.</p></div>{!publicReadOnly&&<button className="primary" onClick={()=>setShowImport(true)}><Upload size={16}/> Import records</button>}</div>
        <div className="search-panel">
          <div className="search-row"><Search size={21}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try ‘10 L nitrogen cylinder 200 bar’ or a manufacturer part number…"/><button>Search</button></div>
          <div className="filters"><button className="filter-active"><Database size={14}/> Internal verified records</button><div className="separator"/><label><Filter size={14}/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={13}/></label><button>Manufacturer <ChevronDown size={13}/></button><button>Supplier country <ChevronDown size={13}/></button><button>Quote date <ChevronDown size={13}/></button></div>
        </div>
        {notice&&<div className="notice"><AlertTriangle size={16}/><span>{notice}</span><button onClick={()=>setNotice("")}><X size={14}/></button></div>}
        <div className="results-head"><div><strong>{results.length} products</strong><span> ranked by exact and keyword match</span></div><div className="legend"><span><i className="dot verified"/>Verified internal</span><span><i className="dot review"/>Needs review</span></div></div>
        <div className="table-card">
          <table><thead><tr><th>Product</th><th>Model / part no.</th><th>Category</th><th>Best known offer</th><th>Supplier</th><th>Evidence</th><th>Link</th></tr></thead>
          <tbody>{results.map(p=>{const o=offerFor(p.id),s=supplierFor(o?.supplierId);return <tr key={p.id} onClick={()=>setSelected(p)}>
            <td><div className="product-cell"><div className="product-icon"><PackageSearch size={19}/></div><div><strong>{p.name}</strong><span>{p.manufacturer||"—"}</span></div></div></td>
            <td><code>{p.modelNumber||"—"}</code><small>{p.productCode||"—"}</small></td><td>{p.category||"—"}</td>
            <td>{o?.unitPrice!=null?<><strong>{new Intl.NumberFormat("en-GB",{style:"currency",currency:o.currency}).format(o.unitPrice)}</strong><small>{o.vatStatus} VAT · {o.quotationDate||"—"}</small></>:<span className="muted">—</span>}</td>
            <td>{s?<><strong>{s.companyName}</strong><small>{s.dispatchLocation}</small></>:"—"}</td><td><Status value={p.reviewStatus}/></td><td>{p.productUrl?<a className="external-link" href={p.productUrl} target="_blank" rel="noopener noreferrer" title="Open product page" aria-label={`Open product page for ${p.name}`} onClick={e=>e.stopPropagation()}><ArrowUpRight size={16}/></a>:<span className="muted">—</span>}</td>
          </tr>})}</tbody></table>
          {!results.length&&<div className="empty"><PackageSearch size={30}/><strong>No internal matches</strong><p>Adjust filters or preserve this query for future external sourcing.</p></div>}
        </div>
        <div className="lower-grid"><div className="insight-card"><div className="card-title"><div><History size={17}/><strong>Recent sourcing knowledge</strong></div><button>View all</button></div><ul><li><span className="timeline-dot blue"/><div><strong>Price evidence updated</strong><p>ROAIRVAC 6.0 · Stuart Plumbing</p></div><time>2 Nov</time></li><li><span className="timeline-dot amber"/><div><strong>Model requires confirmation</strong><p>Schneider Electric PM800 family</p></div><time>30 Oct</time></li><li><span className="timeline-dot green"/><div><strong>Supplier verified</strong><p>Gas Bottles Direct · Prague dispatch</p></div><time>30 Oct</time></li></ul></div>
        <div className="insight-card"><div className="card-title"><div><Database size={17}/><strong>Data quality</strong></div><button>Review queue</button></div><div className="quality"><div><b>78%</b><span>records verified</span></div><div className="progress"><i style={{width:"78%"}}/></div><p><AlertTriangle size={14}/> 2 demonstration records need specification review.</p></div></div></div>
      </section>
    </main>
    {selected&&<div className="drawer-backdrop" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}><X/></button><span className="eyebrow">PRODUCT RECORD</span><h2>{selected.name}</h2><p>{selected.description}</p>{selected.productUrl&&<a className="primary drawer-product-link" href={selected.productUrl} target="_blank" rel="noopener noreferrer">Open product page <ArrowUpRight size={15}/></a>}<div className="drawer-meta"><div><span>Manufacturer</span><strong>{selected.manufacturer||"Not recorded"}</strong></div><div><span>Model</span><strong>{selected.modelNumber||"Not recorded"}</strong></div><div><span>Category</span><strong>{selected.category}</strong></div><div><span>RFQ name</span><strong>{selected.rfqName||"Not recorded"}</strong></div><div><span>Date</span><strong>{selected.recordDate||"Not recorded"}</strong></div><div><span>Review status</span><Status value={selected.reviewStatus}/></div></div><div className="tabs"><button className="active">Overview</button><button>Specifications</button><button>Suppliers & Prices</button><button>History</button></div><div className="evidence-box"><ShieldCheck/><div><strong>Source-traceable record</strong><p>This demonstration entry shows how product facts, supplier offers and historical evidence remain separate.</p></div></div></aside></div>}
    {showImport&&<div className="modal-backdrop"><section className="modal"><button className="close" onClick={()=>setShowImport(false)}><X/></button><span className="eyebrow">DATA IMPORT</span><h2>Import spreadsheet data</h2><p>Upload Excel, CSV or TSV, or paste rows below. The first worksheet and first header row will be used.</p><div className="mapping"><span>Recognised headers</span><code>date · rfqName · productCode · name · manufacturer · modelNumber · category · url · description</code></div><div className={`drop-zone ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={dropFile} onClick={()=>fileInput.current?.click()}><input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.tsv" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void readImportFile(file)}}/><FileSpreadsheet size={26}/><strong>{importFileName||"Drop spreadsheet here or choose a file"}</strong><span>{importRowsData.length?`${importRowsData.length} data row(s) ready`:".xlsx, .xls, .csv or .tsv"}</span></div><div className="import-or"><span>or paste rows</span></div><textarea value={paste} onChange={e=>{setPaste(e.target.value);setImportRowsData([]);setImportFileName("")}} placeholder={'date\trfqName\tproductCode\tname\tmanufacturer\tmodelNumber\tcategory\n2026-11-05\tWind farm spares\tPL-001\tDigital Power Meter\tSchneider Electric\tPM8240\tElectrical & Instrumentation'}/><div className="modal-actions"><button className="secondary" onClick={()=>setShowImport(false)}>Cancel</button><button className="primary" onClick={importRows}><Upload size={15}/> Validate & import</button></div></section></div>}
  </div>;
}
