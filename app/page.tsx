"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Boxes, CheckCircle2, ChevronDown, CircleDollarSign, Database, Download, FileSpreadsheet, Filter, History, LayoutDashboard, PackageSearch, Pencil, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Upload, Users, X } from "lucide-react";

type Product = { id:number; productCode:string; name:string; manufacturer:string|null; modelNumber:string|null; category:string|null; rfqName?:string|null; recordDate?:string|null; productUrl?:string|null; description:string|null; reviewStatus:string; sourceType:string; createdAt?:string; updatedAt?:string };
type Specification = { id:number; productId:number; key:string; value:string; unit:string|null };
type ProductFields = Pick<Product,"productCode"|"name"|"manufacturer"|"modelNumber"|"category"|"rfqName"|"recordDate"|"productUrl"|"description"|"reviewStatus">;
type Supplier = { id:number; companyName:string; country:string|null; dispatchLocation:string|null; verificationStatus:string };
type Offer = { id:number; rfqItemId:number|null; productId:number; supplierId:number; unitPrice:number|null; currency:string; vatStatus:string; quotationDate:string|null; stockStatus:string|null; leadTime:string|null; shippingCost:number|null; sourceUrl:string|null };
type CustomerAssociation = { productId:number|null; rfqItemId:number; rfqName:string; customerCompany:string|null; customerContact:string|null; quantity:number; sourceRow:number|null };
type CatalogData = { products:Product[]; specifications:Specification[]; suppliers:Supplier[]; offers:Offer[]; customerAssociations:CustomerAssociation[]; error?:string };

const websiteImportHeaders=["date","rfqName","productCode","name","manufacturer","modelNumber","category","supplier","customerCompany","customerContact","url","currency","quantity","unitCostExVat","shipping","description","sourceRow"];

const nav = [
  ["Smart Search", Search], ["Overview", LayoutDashboard], ["Product Library", Boxes], ["Suppliers", Users],
  ["Alternatives", Sparkles], ["Projects & RFQs", FileSpreadsheet], ["Data Import", Upload], ["Analytics", CircleDollarSign], ["Settings", Settings],
] as const;

function Status({value}:{value:string}) {
  const good = ["verified","Available","In stock"].includes(value);
  return <span className={`status ${good ? "status-good" : value === "review" || value === "Low stock" ? "status-warn" : "status-neutral"}`}>{good && <CheckCircle2 size={12}/>} {value.replaceAll("_"," ")}</span>;
}

export default function Home() {
  const [products,setProducts]=useState<Product[]>([]), [suppliers,setSuppliers]=useState<Supplier[]>([]), [offers,setOffers]=useState<Offer[]>([]);
  const [specifications,setSpecifications]=useState<Specification[]>([]);
  const [customerAssociations,setCustomerAssociations]=useState<CustomerAssociation[]>([]);
  const [loading,setLoading]=useState(true), [loadError,setLoadError]=useState("");
  const [query,setQuery]=useState(""), [category,setCategory]=useState("All categories"), [active,setActive]=useState("Smart Search"), [selected,setSelected]=useState<Product|null>(null);
  const [page,setPage]=useState(1);
  const [showImport,setShowImport]=useState(false), [paste,setPaste]=useState(""), [notice,setNotice]=useState("");
  const [importRowsData,setImportRowsData]=useState<Array<Record<string,string>>>([]), [importFileName,setImportFileName]=useState(""), [dragging,setDragging]=useState(false);
  const [detailTab,setDetailTab]=useState("Overview"), [editing,setEditing]=useState(false), [saving,setSaving]=useState(false), [exporting,setExporting]=useState(false);
  const [editProduct,setEditProduct]=useState<ProductFields|null>(null), [editSpecifications,setEditSpecifications]=useState<Array<{key:string;value:string;unit:string}>>([]);
  const fileInput=useRef<HTMLInputElement>(null);

  async function refreshCatalog(){
    const response=await fetch("/api/catalog",{cache:"no-store"});
    const data=await response.json() as CatalogData;
    if(!response.ok)throw new Error(data.error||"Unable to load catalogue");
    setProducts(data.products);setSpecifications(data.specifications||[]);setSuppliers(data.suppliers);setOffers(data.offers);setCustomerAssociations(data.customerAssociations||[]);
    if(selected){const refreshed=data.products.find((product:Product)=>product.id===selected.id);if(refreshed)setSelected(refreshed)}
  }

  useEffect(()=>{
    let cancelled=false;
    fetch("/api/catalog",{cache:"no-store"}).then(async response=>{
      const data=await response.json() as CatalogData;
      if(!response.ok)throw new Error(data.error||"Unable to load catalogue");
      if(!cancelled){setProducts(data.products);setSpecifications(data.specifications||[]);setSuppliers(data.suppliers);setOffers(data.offers);setCustomerAssociations(data.customerAssociations||[])}
    }).catch(error=>{if(!cancelled)setLoadError(error instanceof Error?error.message:"Unable to load catalogue")}).finally(()=>{if(!cancelled)setLoading(false)});
    return ()=>{cancelled=true};
  },[]);
  const categories=useMemo(()=>["All categories",...Array.from(new Set(products.map(p=>p.category).filter(Boolean) as string[]))], [products]);
  const results=useMemo(()=>products.filter(p=>{
    const hay=[p.name,p.manufacturer,p.modelNumber,p.category,p.description].join(" ").toLowerCase();
    return (!query || hay.includes(query.toLowerCase())) && (category==="All categories" || p.category===category);
  }),[products,query,category]);
  const pageSize=50, pageCount=Math.max(1,Math.ceil(results.length/pageSize));
  const pagedResults=useMemo(()=>results.slice((page-1)*pageSize,page*pageSize),[results,page]);
  const offerFor=(id:number)=>offers.find(o=>o.productId===id);
  const supplierFor=(id?:number)=>suppliers.find(s=>s.id===id);
  const customersFor=(id:number)=>customerAssociations.filter(association=>association.productId===id);
  const verifiedCount=products.filter(product=>product.reviewStatus==="verified").length;
  const verifiedPercent=products.length?Math.round(verifiedCount/products.length*100):0;
  const recentProducts=useMemo(()=>[...products].filter(product=>product.recordDate).sort((a,b)=>(b.recordDate||"").localeCompare(a.recordDate||"")).slice(0,3),[products]);
  const formatPrice=(offer:Offer)=>{
    const amount=offer.unitPrice??0;
    const formattedAmount=new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
    if(offer.currency==="UNKNOWN")return formattedAmount;
    try{return new Intl.NumberFormat("en-GB",{style:"currency",currency:offer.currency}).format(amount);}
    catch(error){if(!(error instanceof RangeError))throw error;return `${offer.currency} ${formattedAmount}`;}
  };

  function parsePastedRows(){
    const lines=paste.trim().split(/\r?\n/).filter(Boolean); if(lines.length<2)return [];
    const delimiter=lines[0].includes("\t")?"\t":",";
    const parseLine=(line:string)=>{const values:string[]=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(char===delimiter&&!quoted){values.push(value.trim());value=""}else value+=char}values.push(value.trim());return values};
    const headers=parseLine(lines[0]);
    return lines.slice(1).map(line=>Object.fromEntries(parseLine(line).map((value,index)=>[headers[index],value])));
  }

  async function readImportFile(file:File){
    if(!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)){setNotice("Use an .xlsx, .xls, .csv or .tsv file.");return;}
    try{
      const XLSX=await import("xlsx");
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
    if(rows.length>5000){setNotice("Import at most 5,000 rows at a time.");return;}
    try{
      let imported=0,updated=0,skipped=0;
      for(let offset=0;offset<rows.length;offset+=100){
        setNotice(`Importing rows ${offset+1}–${Math.min(offset+100,rows.length)} of ${rows.length}…`);
        const res=await fetch("/api/catalog",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fileName:importFileName||"pasted-spreadsheet",rows:rows.slice(offset,offset+100)})});
        const data=await res.json() as {error?:string;imported:number;updated:number;skipped:number}; if(!res.ok)throw new Error(data.error||"Import failed");
        imported+=data.imported;updated+=data.updated;skipped+=data.skipped;
      }
      setShowImport(false); setPaste("");setImportRowsData([]);setImportFileName("");
      await refreshCatalog();
      setNotice(`${imported} product(s) added, ${updated} matched product(s) updated, ${skipped} row(s) skipped.`);
    }catch(error){setNotice(error instanceof Error?error.message:"Import failed");}
  }

  async function exportWorkbook(){
    setExporting(true);
    try{
      const XLSX=await import("xlsx");
      const workbook=XLSX.utils.book_new();
      const productRows=products.flatMap(product=>{
        const associations=customersFor(product.id);
        const linkedAssociations=associations.length?associations:[null];
        return linkedAssociations.flatMap(association=>{
          const productOffers=association
            ? offers.filter(offer=>offer.rfqItemId===association.rfqItemId)
            : offers.filter(offer=>offer.productId===product.id);
          const rows=productOffers.length?productOffers:[null];
          return rows.map(offer=>{
            const supplier=supplierFor(offer?.supplierId);
            const row:Record<string,string|number>={date:offer?.quotationDate||product.recordDate||"",rfqName:association?.rfqName||product.rfqName||"",productCode:product.productCode,name:product.name,manufacturer:product.manufacturer||"",modelNumber:product.modelNumber||"",category:product.category||"",supplier:supplier?.companyName||"",customerCompany:association?.customerCompany||"",customerContact:association?.customerContact||"",url:offer?.sourceUrl||product.productUrl||"",currency:offer?.currency==="UNKNOWN"?"":offer?.currency||"",quantity:association?.quantity??"",unitCostExVat:offer?.unitPrice??"",shipping:offer?.shippingCost??"",description:product.description||"",sourceRow:association?.sourceRow??""};
            return row;
          });
        });
      });
      productRows.sort((a,b)=>Number(a.sourceRow||Number.MAX_SAFE_INTEGER)-Number(b.sourceRow||Number.MAX_SAFE_INTEGER));
      XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(productRows,{header:websiteImportHeaders}),"Website Import");
      XLSX.writeFile(workbook,`procurement-catalog-${new Date().toISOString().slice(0,10)}.xlsx`);
      setNotice("Excel workbook exported.");
    }catch(error){setNotice(error instanceof Error?`Export failed: ${error.message}`:"Export failed.");}
    finally{setExporting(false);}
  }

  function startEditing(product:Product){
    setEditProduct({productCode:product.productCode,name:product.name,manufacturer:product.manufacturer,modelNumber:product.modelNumber,category:product.category,rfqName:product.rfqName||"",recordDate:product.recordDate||"",productUrl:product.productUrl||"",description:product.description,reviewStatus:product.reviewStatus});
    setEditSpecifications(specifications.filter(specification=>specification.productId===product.id).map(({key,value,unit})=>({key,value,unit:unit||""})));
    setEditing(true);setDetailTab("Overview");
  }

  async function saveProduct(){
    if(!selected||!editProduct)return;
    setSaving(true);
    try{
      const response=await fetch(`/api/catalog/${selected.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({product:editProduct,specifications:editSpecifications})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Unable to save product.");
      await refreshCatalog();setEditing(false);setNotice("Product record saved.");
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to save product.");}
    finally{setSaving(false);}
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">PL</div><div><strong>Prowling Lions</strong><small>Procurement Intelligence</small></div></div>
      <nav>{nav.map(([label,Icon],i)=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);if(label==="Data Import")setShowImport(true)}}><Icon size={17}/><span>{label}</span>{i===0&&<kbd>⌘K</kbd>}</button>)}</nav>
      <div className="sidebar-foot"><ShieldCheck size={17}/><div><strong>Public catalogue</strong><small>Anyone can edit records</small></div></div>
    </aside>
    <main>
      <header className="topbar"><div><span className="eyebrow">WORKSPACE</span><strong>Procurement Operations</strong></div><div className="top-actions"><span className="sync"><span/> Database connected</span><button className="secondary" onClick={()=>void exportWorkbook()} disabled={exporting}><Download size={15}/> {exporting?"Exporting…":"Export Excel"}</button><button className="secondary" onClick={()=>setShowImport(true)}><Upload size={15}/> Import Excel</button><div className="avatar">CW</div></div></header>
      <section className="content">
        <div className="page-title"><div><span className="eyebrow">SMART SEARCH</span><h1>Find what your team already knows.</h1><p>Search products, model numbers, specifications, suppliers and historical quotations.</p></div></div>
        <div className="search-panel">
          <div className="search-row"><Search size={21}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Try ‘10 L nitrogen cylinder 200 bar’ or a manufacturer part number…"/><button>Search</button></div>
          <div className="filters"><button className="filter-active"><Database size={14}/> Internal verified records</button><div className="separator"/><label><Filter size={14}/><select value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={13}/></label><button>Manufacturer <ChevronDown size={13}/></button><button>Supplier country <ChevronDown size={13}/></button><button>Quote date <ChevronDown size={13}/></button></div>
        </div>
        {notice&&<div className="notice"><AlertTriangle size={16}/><span>{notice}</span><button onClick={()=>setNotice("")}><X size={14}/></button></div>}
        <div className="results-head"><div><strong>{loading?"Loading catalogue…":`${results.length} products`}</strong>{!loading&&results.length>0&&<span> · showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,results.length)}</span>}</div><div className="legend"><span><i className="dot verified"/>Verified internal</span><span><i className="dot review"/>Needs review</span></div></div>
        <div className="table-card">
          <table><colgroup><col className="product-column"/><col className="model-column"/><col className="category-column"/><col className="customer-column"/><col className="offer-column"/><col className="supplier-column"/><col className="evidence-column"/><col className="link-column"/></colgroup><thead><tr><th>Product</th><th>Model / part no.</th><th>Category</th><th>Customer company</th><th>Best known offer</th><th>Supplier</th><th>Evidence</th><th>Link</th></tr></thead>
          <tbody>{loading?<tr><td colSpan={8}><div className="loading-row"><span className="loading-spinner"/> Loading product library…</div></td></tr>:loadError?<tr><td colSpan={8}><div className="loading-row error">{loadError}</div></td></tr>:pagedResults.map(p=>{const o=offerFor(p.id),s=supplierFor(o?.supplierId),customers=customersFor(p.id);const customerNames=Array.from(new Set(customers.map(customer=>customer.customerCompany).filter(Boolean) as string[]));return <tr key={p.id} onClick={()=>{setSelected(p);setDetailTab("Overview");setEditing(false)}}>
            <td><div className="product-cell" title={p.name}><div className="product-icon"><PackageSearch size={19}/></div><div><strong>{p.name}</strong><span>{p.manufacturer||"—"}</span></div></div></td>
            <td><code>{p.modelNumber||"—"}</code><small>{p.productCode||"—"}</small></td><td>{p.category||"—"}</td>
            <td className="customer-cell" title={customerNames.join(", ")||"—"}>{customerNames.length>1?<>{customerNames[0]} <small>+{customerNames.length-1} more</small></>:customerNames[0]||"—"}</td>
            <td>{o?.unitPrice!=null?<><strong>{formatPrice(o)}</strong><small>{o.vatStatus||"—"} VAT · {o.quotationDate||"—"}</small></>:<><strong>—</strong><small>—</small></>}</td>
            <td>{s?<><strong>{s.companyName}</strong><small>{s.dispatchLocation||"—"}</small></>:<><strong>—</strong><small>—</small></>}</td><td><Status value={p.reviewStatus}/></td><td>{p.productUrl?<a className="external-link" href={p.productUrl} target="_blank" rel="noopener noreferrer" title="Open product page" aria-label={`Open product page for ${p.name}`} onClick={e=>e.stopPropagation()}><ArrowUpRight size={16}/></a>:<span className="muted">—</span>}</td>
          </tr>})}</tbody></table>
          {!loading&&!loadError&&!results.length&&<div className="empty"><PackageSearch size={30}/><strong>No internal matches</strong><p>Adjust filters or preserve this query for future external sourcing.</p></div>}
          {!loading&&!loadError&&results.length>pageSize&&<div className="pagination"><button disabled={page===1} onClick={()=>setPage(current=>Math.max(1,current-1))}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page===pageCount} onClick={()=>setPage(current=>Math.min(pageCount,current+1))}>Next</button></div>}
        </div>
        <div className="lower-grid"><div className="insight-card"><div className="card-title"><div><History size={17}/><strong>Recent sourcing knowledge</strong></div></div><ul>{recentProducts.map((product,index)=><li key={product.id}><span className={`timeline-dot ${index===0?"blue":index===1?"amber":"green"}`}/><div><strong>{product.name}</strong><p>{supplierFor(offerFor(product.id)?.supplierId)?.companyName||"—"}</p></div><time>{product.recordDate||"—"}</time></li>)}</ul></div>
        <div className="insight-card"><div className="card-title"><div><Database size={17}/><strong>Data quality</strong></div></div><div className="quality"><div><b>{verifiedPercent}%</b><span>records verified</span></div><div className="progress"><i style={{width:`${verifiedPercent}%`}}/></div><p><AlertTriangle size={14}/> {products.length-verifiedCount} records need review.</p></div></div></div>
      </section>
    </main>
    {selected&&<div className="drawer-backdrop" onClick={()=>{setSelected(null);setEditing(false)}}><aside className="drawer" onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={()=>{setSelected(null);setEditing(false)}} aria-label="Close product details"><X/></button>
      <span className="eyebrow">PRODUCT RECORD</span>
      <div className="drawer-heading"><h2>{editing&&editProduct?editProduct.name:selected.name}</h2>
        {editing?<div className="drawer-actions"><button className="secondary" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button><button className="primary" onClick={()=>void saveProduct()} disabled={saving}>{saving?"Saving…":"Save changes"}</button></div>:<button className="secondary" onClick={()=>startEditing(selected)}><Pencil size={14}/> Edit record</button>}
      </div>
      <div className="tabs" role="tablist" aria-label="Product details">
        {["Overview","Specifications","Suppliers & Prices"].map(tab=><button key={tab} role="tab" aria-selected={detailTab===tab} className={detailTab===tab?"active":""} onClick={()=>setDetailTab(tab)}>{tab}</button>)}
      </div>
      {detailTab==="Overview"&&(editing&&editProduct?<div className="edit-grid">
        <label>Product code<input value={editProduct.productCode} onChange={e=>setEditProduct({...editProduct,productCode:e.target.value})}/></label>
        <label>Product name<input value={editProduct.name} onChange={e=>setEditProduct({...editProduct,name:e.target.value})}/></label>
        <label>Manufacturer<input value={editProduct.manufacturer||""} onChange={e=>setEditProduct({...editProduct,manufacturer:e.target.value})}/></label>
        <label>Model / part number<input value={editProduct.modelNumber||""} onChange={e=>setEditProduct({...editProduct,modelNumber:e.target.value})}/></label>
        <label>Category<input value={editProduct.category||""} onChange={e=>setEditProduct({...editProduct,category:e.target.value})}/></label>
        <label>RFQ name<input value={editProduct.rfqName||""} onChange={e=>setEditProduct({...editProduct,rfqName:e.target.value})}/></label>
        <label>Record date<input value={editProduct.recordDate||""} onChange={e=>setEditProduct({...editProduct,recordDate:e.target.value})}/></label>
        <label>Review status<select value={editProduct.reviewStatus} onChange={e=>setEditProduct({...editProduct,reviewStatus:e.target.value})}><option value="verified">Verified</option><option value="review">Needs review</option></select></label>
        <label className="edit-full">Product URL<input value={editProduct.productUrl||""} onChange={e=>setEditProduct({...editProduct,productUrl:e.target.value})}/></label>
        <label className="edit-full">Description<textarea value={editProduct.description||""} onChange={e=>setEditProduct({...editProduct,description:e.target.value})}/></label>
      </div>:<><p>{selected.description||"No description recorded."}</p>{selected.productUrl&&<a className="primary drawer-product-link" href={selected.productUrl} target="_blank" rel="noopener noreferrer">Open product page <ArrowUpRight size={15}/></a>}<div className="drawer-meta">
        <div><span>Product code</span><strong>{selected.productCode||"—"}</strong></div><div><span>Manufacturer</span><strong>{selected.manufacturer||"—"}</strong></div>
        <div><span>Model</span><strong>{selected.modelNumber||"—"}</strong></div><div><span>Category</span><strong>{selected.category||"—"}</strong></div>
        <div><span>RFQ name</span><strong>{selected.rfqName||"—"}</strong></div><div><span>Date</span><strong>{selected.recordDate||"—"}</strong></div>
        <div><span>Review status</span><Status value={selected.reviewStatus}/></div>
      </div>{customersFor(selected.id).length>0&&<section className="customer-records"><h3>Customer companies & RFQs</h3>{customersFor(selected.id).map(customer=><article key={customer.rfqItemId}><strong>{customer.customerCompany||"Customer not recorded"}</strong><span>{customer.rfqName||"RFQ not recorded"} · Qty {customer.quantity}</span>{customer.customerContact&&<small>Contact: {customer.customerContact}</small>}</article>)}</section>}<div className="evidence-box"><ShieldCheck/><div><strong>Source-traceable record</strong><p>Product, supplier and quotation information is retained from the original procurement workbook.</p></div></div></>)}
      {detailTab==="Specifications"&&<section className="specifications-panel">
        <div className="specifications-heading"><div><h3>Specifications</h3><p>Technical details recorded for this product.</p></div>{editing&&<button className="secondary" onClick={()=>setEditSpecifications([...editSpecifications,{key:"",value:"",unit:""}])}><Plus size={14}/> Add specification</button>}</div>
        {editing?editSpecifications.length?<div className="spec-edit-list">{editSpecifications.map((specification,index)=><div className="spec-edit-row" key={index}>
          <label>Name<input value={specification.key} onChange={e=>setEditSpecifications(editSpecifications.map((item,i)=>i===index?{...item,key:e.target.value}:item))}/></label>
          <label>Value<input value={specification.value} onChange={e=>setEditSpecifications(editSpecifications.map((item,i)=>i===index?{...item,value:e.target.value}:item))}/></label>
          <label>Unit<input value={specification.unit} onChange={e=>setEditSpecifications(editSpecifications.map((item,i)=>i===index?{...item,unit:e.target.value}:item))}/></label>
          <button className="icon-button danger" onClick={()=>setEditSpecifications(editSpecifications.filter((_,i)=>i!==index))} aria-label={`Remove ${specification.key||"specification"}`}><Trash2 size={15}/></button>
        </div>)}</div>:<div className="empty-specs">No specifications yet. Add one above or import columns named <code>spec: Voltage</code>.</div>
        :specifications.filter(specification=>specification.productId===selected.id).length?<div className="spec-list">{specifications.filter(specification=>specification.productId===selected.id).map(specification=><div className="spec-item" key={specification.id}><span>{specification.key}</span><strong>{specification.value}{specification.unit?` ${specification.unit}`:""}</strong></div>)}</div>
        :<div className="empty-specs">No detailed specifications have been recorded for this product yet. Select <strong>Edit record</strong> to add them.</div>}
        <div className="product-facts"><h4>Product information</h4><div className="spec-list">
          <div className="spec-item"><span>Product</span><strong>{selected.name||"—"}</strong></div>
          <div className="spec-item"><span>Product code</span><strong>{selected.productCode||"—"}</strong></div>
          <div className="spec-item"><span>Manufacturer</span><strong>{selected.manufacturer||"—"}</strong></div>
          <div className="spec-item"><span>Model / part number</span><strong>{selected.modelNumber||"—"}</strong></div>
          <div className="spec-item"><span>Category</span><strong>{selected.category||"—"}</strong></div>
          <div className="spec-item"><span>RFQ name</span><strong>{selected.rfqName||"—"}</strong></div>
          <div className="spec-item"><span>Record date</span><strong>{selected.recordDate||"—"}</strong></div>
          <div className="spec-item"><span>Description</span><strong>{selected.description||"—"}</strong></div>
          {selected.productUrl&&<div className="spec-item"><span>Product link</span><a href={selected.productUrl} target="_blank" rel="noopener noreferrer">Open product page <ArrowUpRight size={13}/></a></div>}
        </div></div>
      </section>}
      {detailTab==="Suppliers & Prices"&&<section className="supplier-offers">{offers.filter(offer=>offer.productId===selected.id).length?offers.filter(offer=>offer.productId===selected.id).map(offer=>{const supplier=supplierFor(offer.supplierId);return <article className="offer-item" key={offer.id}><div><strong>{supplier?.companyName||"Supplier not recorded"}</strong><span>{supplier?.country||supplier?.dispatchLocation||"Location not recorded"}</span></div><strong>{offer.unitPrice==null?"Price not recorded":formatPrice(offer)}{offer.vatStatus&&<small>{offer.vatStatus} VAT</small>}</strong><span>{offer.quotationDate||"Date not recorded"}</span></article>}):<div className="empty-specs">No supplier quotations are linked to this product.</div>}</section>}
    </aside></div>}
    {showImport&&<div className="modal-backdrop" onClick={()=>setShowImport(false)}><section className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowImport(false)} aria-label="Close import dialog"><X/></button><span className="eyebrow">DATA IMPORT</span><h2>Import spreadsheet data</h2><p>Upload Excel, CSV or TSV, or paste rows. Column names are flexible; only the product name is required. Existing records are matched by code or product name and RFQ. Customer companies, RFQs, suppliers, prices and quantities are linked automatically when provided.</p><div className="mapping"><span>Template columns</span><code>{websiteImportHeaders.join(" · ")}</code></div><div className={`drop-zone ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={dropFile} onClick={()=>fileInput.current?.click()}><input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.tsv" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void readImportFile(file)}}/><FileSpreadsheet size={26}/><strong>{importFileName||"Drop spreadsheet here or choose a file"}</strong><span>{importRowsData.length?`${importRowsData.length} data row(s) ready`:".xlsx, .xls, .csv or .tsv"}</span></div><div className="import-or"><span>or paste rows</span></div><textarea value={paste} onChange={e=>{setPaste(e.target.value);setImportRowsData([]);setImportFileName("")}} placeholder={'date\trfqName\tproductCode\tname\tmanufacturer\tmodelNumber\tcategory\n2026-11-05\tWind farm spares\tPL-001\tDigital Power Meter\tSchneider Electric\tPM8240\tElectrical & Instrumentation'}/><div className="modal-actions"><button className="secondary" onClick={()=>setShowImport(false)}>Cancel</button><button className="primary" onClick={()=>void importRows()}><Upload size={15}/> Validate & import</button></div></section></div>}
  </div>;
}
