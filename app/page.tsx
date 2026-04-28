'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import FactoryABI from './abis/ArcSentryFactory.json';
import VaultABI from './abis/ArcSentryVault.json';

declare global { interface Window { ethereum?: any; } }

const ARC_CHAIN_ID  = 5042002;
const ARC_CHAIN_HEX = '0x4CEF52';
const FACTORY_ADDR  = process.env.NEXT_PUBLIC_FACTORY_ADDRESS!;
const USDC_ADDR     = process.env.NEXT_PUBLIC_USDC_ADDRESS!;

const ARC_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: [
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
],

const VS: Record<number, string> = {
  0:'Draft', 1:'Accepted', 2:'Funded',
  3:'Release Requested', 4:'Disputed',
  5:'Completed', 6:'Refunded', 7:'Cancelled',
};

const statusCfg: Record<string,{color:string;bg:string;pulse:boolean}> = {
  'Draft':             {color:'#888',    bg:'rgba(136,136,136,0.12)', pulse:false},
  'Accepted':          {color:'#60A5FA', bg:'rgba(96,165,250,0.12)',  pulse:false},
  'Funded':            {color:'#00FF94', bg:'rgba(0,255,148,0.12)',   pulse:true },
  'Release Requested': {color:'#FBBF24', bg:'rgba(251,191,36,0.12)',  pulse:false},
  'Disputed':          {color:'#F87171', bg:'rgba(248,113,113,0.12)', pulse:false},
  'Completed':         {color:'#00FF94', bg:'rgba(0,255,148,0.08)',   pulse:false},
  'Refunded':          {color:'#A78BFA', bg:'rgba(167,139,250,0.12)', pulse:false},
  'Cancelled':         {color:'#6b7280', bg:'rgba(107,114,128,0.1)',  pulse:false},
};

interface Vault {
  address:string; client:string; specialist:string;
  amount:bigint; description:string; status:number; createdAt:bigint;
}

interface PerimeterEvent {
  vaultAddr:string; action:string; amount:bigint; timestamp:number;
}

const fmt     = (a:string) => `${a.slice(0,6)}...${a.slice(-4)}`;
const fmtUsdc = (r:bigint) => (Number(r)/1e6).toLocaleString('en-US',{minimumFractionDigits:2});
const exAddr  = (a:string) => `https://testnet.arcscan.app/address/${a}`;
const exTx    = (h:string) => `https://testnet.arcscan.app/tx/${h}`;

// ── Gas helper ────────────────────────────────────────────────────────────────
// Arc is EIP-1559. Always fetch live fee data + add 30% buffer so txs never
// stall with "gas price too low". Falls back to safe fixed values on error.
const getGasParams = async (provider: ethers.BrowserProvider) => {
  try {
    const feeData = await provider.getFeeData();
    const base = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('1','gwei');
    const tip  = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('0.1','gwei');
    return {
      maxFeePerGas:         base * 130n / 100n,  // +30% headroom
      maxPriorityFeePerGas: tip,
    };
  } catch {
    return {
      maxFeePerGas:         ethers.parseUnits('2','gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.5','gwei'),
    };
  }
};

const Logo = ({size=34}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{flexShrink:0}}>
    <defs><filter id="lg"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="M20 3 L37 15 L37 29 L20 37 L3 29 L3 15 Z" stroke="#00FF94" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    <path d="M11 15 Q20 8 29 15" stroke="#00FF94" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M9 21 Q20 12 31 21" stroke="#00FF94" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.45"/>
    <line x1="20" y1="9" x2="20" y2="31" stroke="#00FF94" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="20" y1="9" x2="20" y2="31" stroke="#00FF94" strokeWidth="4" strokeLinecap="round" filter="url(#lg)" opacity="0.35"/>
    <circle cx="20" cy="20" r="2.5" fill="#00FF94" filter="url(#lg)"/>
  </svg>
);

const Badge = ({s}:{s:string}) => {
  const cfg = statusCfg[s]||statusCfg['Draft'];
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}35`,borderRadius:20,padding:'3px 10px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,letterSpacing:'0.04em',whiteSpace:'nowrap'}}>
      {cfg.pulse&&<span style={{width:6,height:6,borderRadius:'50%',background:cfg.color,boxShadow:`0 0 7px ${cfg.color}`,display:'inline-block',animation:'arcpulse 1.8s ease-in-out infinite'}}/>}
      {s}
    </span>
  );
};

const Tip = ({text,children}:{text:string;children:React.ReactNode}) => {
  const [v,setV] = useState(false);
  return (
    <span style={{position:'relative',display:'inline-block'}} onMouseEnter={()=>setV(true)} onMouseLeave={()=>setV(false)}>
      {children}
      {v&&<span style={{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',background:'rgba(8,8,11,0.97)',border:'1px solid rgba(0,255,148,0.25)',borderRadius:8,padding:'8px 13px',fontSize:11.5,color:'#aaa',whiteSpace:'nowrap',zIndex:900,backdropFilter:'blur(10px)',pointerEvents:'none',lineHeight:1.5}}>{text}</span>}
    </span>
  );
};

export default function ArcSentry() {
  const [dark,setDark]             = useState(true);
  const [page,setPage]             = useState<'landing'|'dashboard'|'detail'|'history'>('landing');
  const [showCreate,setShowCreate] = useState(false);
  const [selected,setSelected]     = useState<Vault|null>(null);
  const [showN,setShowN]           = useState(false);
  const [tvg,setTvg]               = useState(0);
  const [vc,setVc]                 = useState(0);
  const [wallet,setWallet]         = useState<string|null>(null);
  const [chainOk,setChainOk]       = useState(false);
  const [wrongNet,setWrongNet]     = useState(false);
  const [vaults,setVaults]         = useState<Vault[]>([]);
  const [perimeter,setPerimeter]   = useState<PerimeterEvent[]>([]);
  const [vaultsLoading,setVaultsLoading] = useState(false);
  const [loading,setLoading]       = useState(false);
  const [txPending,setTxPending]   = useState<{action:string;hash:string}|null>(null);
  const [notifs,setNotifs]         = useState<{id:number;text:string;read:boolean;time:string}[]>([]);
  const [usdcBalance,setUsdcBalance] = useState<bigint>(0n);
  // requestRefund() only emits an event — does NOT change vault status on-chain.
  // We query the vault event log to know if client has ever called it.
  const [refundRequestedVaults,setRefundRequestedVaults] = useState<Set<string>>(new Set());
  

  const specRef = useRef<HTMLInputElement>(null);
  const amtRef  = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const unread    = notifs.filter(n=>!n.read).length;
  const pushNotif = (text:string) => setNotifs(n=>[{id:Date.now(),text,read:false,time:'just now'},...n]);

  const d     = dark;
  const em    = '#00FF94';
  const bg    = d?'#08080B':'#F8F9FA';
  const card  = d?'rgba(18,18,22,0.88)':'rgba(255,255,255,0.92)';
  const cardB = d?'rgba(255,255,255,0.065)':'rgba(0,0,0,0.09)';
  const tx    = d?'#E0E0E0':'#1A1A1A';
  const sub   = d?'#888':'#666';
  const iB    = d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)';
  const iBo   = d?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.13)';
  const mono  = {fontFamily:"'JetBrains Mono',monospace"};
  const cardS = {background:card,border:`1px solid ${cardB}`,borderRadius:16,backdropFilter:'blur(18px)',transition:'background 0.4s ease'};

  const btn = (v:'primary'|'secondary'|'ghost'|'danger'='primary') => ({
    primary:   {background:'linear-gradient(135deg,#00FF94,#00C870)',color:'#000',border:'none',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:"'Inter',sans-serif",transition:'all 0.18s ease'},
    secondary: {background:'transparent',color:em,border:`1px solid ${em}40`,borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:600,fontSize:13,fontFamily:"'Inter',sans-serif",transition:'all 0.18s ease'},
    ghost:     {background:iB,color:sub,border:`1px solid ${cardB}`,borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:500,fontSize:13,fontFamily:"'Inter',sans-serif",transition:'all 0.18s ease'},
    danger:    {background:'rgba(248,113,113,0.1)',color:'#F87171',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:600,fontSize:13,fontFamily:"'Inter',sans-serif",transition:'all 0.18s ease'},
  }[v]);

  const inputS:React.CSSProperties = {background:iB,border:`1px solid ${iBo}`,borderRadius:8,padding:'10px 14px',color:tx,fontSize:13,fontFamily:"'Inter',sans-serif",outline:'none',width:'100%',boxSizing:'border-box'};

  // ── Counter animation ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(wallet&&chainOk&&vaults.length>0){
  const settled = vaults.filter(v=>v.status===5||v.status===6);
  setTvg(settled.reduce((s,v)=>s+Number(v.amount),0)/1e6);
  setVc(settled.length);
  return;
}
    if(page!=='landing') return;
    let t1=0,t2=0,af:number;
    const TVG=2847391,VC=1243;
    const run=()=>{t1=Math.min(t1+Math.ceil(TVG/55),TVG);t2=Math.min(t2+Math.ceil(VC/55),VC);setTvg(t1);setVc(t2);if(t1<TVG||t2<VC)af=requestAnimationFrame(run);};
    const to=setTimeout(()=>{af=requestAnimationFrame(run);},300);
    return()=>{clearTimeout(to);cancelAnimationFrame(af);};
  },[page,wallet,chainOk,vaults]);

  // ── Wallet ────────────────────────────────────────────────────────────────
  const connectWallet = async()=>{
    if(!window.ethereum){alert('Please install Rabby or MetaMask.');return;}
    try{
      const accs=await window.ethereum.request({method:'eth_requestAccounts'});
      setWallet(accs[0]);
      try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_CHAIN_HEX}]});}
      catch(sw:any){if(sw.code===4902||sw.code===-32603){try{await window.ethereum.request({method:'wallet_addEthereumChain',params:[ARC_PARAMS]});}catch(_){}}}
      const cid=await window.ethereum.request({method:'eth_chainId'});
      const ok=parseInt(cid,16)===ARC_CHAIN_ID;
      setChainOk(ok);setWrongNet(!ok);
      if(ok) loadVaults(accs[0],true);
    }catch(e){console.error(e);}
  };

  const switchArc=async()=>{
    if(!window.ethereum) return;
    try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_CHAIN_HEX}]});}
    catch(e:any){if(e.code===4902){try{await window.ethereum.request({method:'wallet_addEthereumChain',params:[ARC_PARAMS]});}catch(_){}}}
    const cid=await window.ethereum.request({method:'eth_chainId'});
    const ok=parseInt(cid,16)===ARC_CHAIN_ID;
    setChainOk(ok);setWrongNet(!ok);
    if(ok&&wallet) loadVaults(wallet,true);
  };

  // ── Load vaults ───────────────────────────────────────────────────────────
  // Also fetches USDC balance and scans RefundRequested events on active vaults
  const loadVaults=useCallback(async(addr:string,showSpinner=false)=>{
    if(showSpinner) setVaultsLoading(true);
    try{
      const provider=new ethers.BrowserProvider(window.ethereum);
      const factory=new ethers.Contract(ethers.getAddress(FACTORY_ADDR),FactoryABI.abi,provider);
      const [asClient,asSpec]=await Promise.all([
  factory.getVaultsByClient(ethers.getAddress(addr)).catch(()=>[]),
  factory.getVaultsBySpecialist(ethers.getAddress(addr)).catch(()=>[]),
]);
const allAddrs:string[]=[...new Set([...asClient,...asSpec])];
      const details=(await Promise.allSettled(allAddrs.map(async(vAddr:string)=>{
  const vault=new ethers.Contract(ethers.getAddress(vAddr),VaultABI.abi,provider);
  const d=await vault.getVaultDetails();
  return {address:vAddr,client:d._client,specialist:d._specialist,amount:d._amount,description:d._description,status:Number(d._status),createdAt:d._createdAt} as Vault;
}))).filter(r=>r.status==='fulfilled').map(r=>(r as PromiseFulfilledResult<Vault>).value);
      const sorted=details.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
      setVaults(sorted);

      // USDC ERC-20 balance
      try{
        const usdc=new ethers.Contract(ethers.getAddress(USDC_ADDR),['function balanceOf(address) view returns (uint256)'],provider);
        setUsdcBalance(await usdc.balanceOf(ethers.getAddress(addr)));
      }catch(_){}

      // Scan RefundRequested events for vaults that are Funded/ReleaseRequested/Disputed
      // requestRefund() emits an event but does NOT change status — so we must read logs
      const refundSet=new Set<string>();
      await Promise.all(
        sorted.filter(v=>v.status===2||v.status===3||v.status===4).map(async(v)=>{
          try{
            const vault=new ethers.Contract(ethers.getAddress(v.address),VaultABI.abi,provider);
            const currentBlock=await provider.getBlockNumber();
const fromBlock=Math.max(0,currentBlock-9000);
const events=await vault.queryFilter(vault.filters.RefundRequested(null),fromBlock,'latest');
            if(events.length>0) refundSet.add(v.address.toLowerCase());
else console.log('No RefundRequested events found for', v.address);
          } catch(err) { console.warn('RefundRequested filter failed for', v.address, err); }
        })
      );
      setRefundRequestedVaults(prev => {
  // Keep any addresses already known, add newly discovered ones
  const merged = new Set(prev);
  refundSet.forEach(addr => merged.add(addr));
  return merged;
});

      // Perimeter
      setPerimeter(
        sorted.filter(v=>[4,5,6].includes(v.status))
          .map(v=>({vaultAddr:v.address,action:VS[v.status],amount:v.amount,timestamp:Number(v.createdAt)}))
          .slice(0,10)
      );
    }catch(e){console.error('loadVaults:',e);}
    finally{setVaultsLoading(false);}
  },[]);

  // ── Auto-refresh every 5s ─────────────────────────────────────────────────
  useEffect(()=>{
    if(!wallet||!chainOk||page==='landing'||showCreate) return;
    const id=setInterval(()=>loadVaults(wallet),5000);
    return()=>clearInterval(id);
  },[wallet,chainOk,page,loadVaults,showCreate]);

  // ── Keep selected vault in sync ───────────────────────────────────────────
  useEffect(()=>{
    if(!selected) return;
    const updated=vaults.find(v=>v.address===selected.address);
    if(updated&&updated.status!==selected.status) setSelected(updated);
  },[vaults,selected]);

  // ── Contract helpers ──────────────────────────────────────────────────────
  const getProvider = ()           => new ethers.BrowserProvider(window.ethereum);
  const getSigner   = async()      => getProvider().getSigner();
  const getVC       = async(a:string) => new ethers.Contract(ethers.getAddress(a),VaultABI.abi,await getSigner());

  const afterTx=async(msg:string,newStatus?:number)=>{
    setTxPending(null);
    pushNotif(msg);
    if(wallet){
      await loadVaults(wallet,false);
      setTimeout(()=>{if(wallet) loadVaults(wallet,false);},2500);
    }
    if(newStatus!==undefined) setSelected(s=>s?{...s,status:newStatus}:s);
  };

  // ── Actions — every tx uses live gas params ───────────────────────────────

  const createVault=async()=>{
    const spec=specRef.current?.value||'';
    const amt=amtRef.current?.value||'';
    const desc=descRef.current?.value||'';
    if(!spec||!amt||!desc){alert('Please fill in all fields');return;}
    if(!ethers.isAddress(spec)){alert('Invalid specialist wallet address');return;}
    if(parseFloat(amt)<=0){alert('Amount must be greater than 0');return;}
    setLoading(true);
    try{
      const signer=await getSigner();
      const factory=new ethers.Contract(ethers.getAddress(FACTORY_ADDR),FactoryABI.abi,signer);
      const gas=await getGasParams(getProvider());
      const t=await factory.createVault(ethers.getAddress(spec),ethers.parseUnits(amt,6),desc,{gasLimit:500000,...gas});
      setTxPending({action:'Creating Vault…',hash:t.hash});
      await t.wait();
      setShowCreate(false);
      if(specRef.current) specRef.current.value='';
      if(amtRef.current)  amtRef.current.value='';
      if(descRef.current) descRef.current.value='';
      await afterTx('New vault created — awaiting Specialist acceptance');
    }catch(e:any){alert(`Error: ${e?.reason||e?.data?.message||e?.message||'Transaction failed'}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const acceptVault=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.acceptVault({gasLimit:200000,...gas});
      setTxPending({action:'Accepting Vault…',hash:t.hash});
      await t.wait();
      await afterTx('Vault accepted — client can now fund',1);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const fundVault=async(v:Vault)=>{
    setLoading(true);
    try{
      const signer=await getSigner();
      const vAddr=ethers.getAddress(v.address);
      const usdc=new ethers.Contract(
        ethers.getAddress(USDC_ADDR),
        ['function approve(address,uint256) returns (bool)',
         'function allowance(address,address) view returns (uint256)',
         'function balanceOf(address) view returns (uint256)'],
        signer
      );
      const sigAddr=await signer.getAddress();
      // Pre-flight balance check
      const currentBal=await usdc.balanceOf(sigAddr);
      if(currentBal<v.amount){
        alert(`Insufficient USDC balance.\n\nYou have: $${(Number(currentBal)/1e6).toFixed(2)} USDC\nVault requires: $${(Number(v.amount)/1e6).toFixed(2)} USDC\n\nGet testnet USDC at faucet.circle.com`);
        return;
      }
      const gas=await getGasParams(getProvider());
      const allow=await usdc.allowance(sigAddr,vAddr);
      if(allow<v.amount){
        const a=await usdc.approve(vAddr,v.amount,{gasLimit:100000,...gas});
        setTxPending({action:'Approving USDC…',hash:a.hash});
        await a.wait();
      }
      const vault=new ethers.Contract(vAddr,VaultABI.abi,signer);
      const t=await vault.fundVault({gasLimit:300000,...gas});
      setTxPending({action:'Funding Vault…',hash:t.hash});
      await t.wait();
      await afterTx('Vault funded — USDC locked onchain',2);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const requestRelease=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.requestRelease({gasLimit:200000,...gas});
      setTxPending({action:'Requesting Release…',hash:t.hash});
      await t.wait();
      await afterTx('Release requested — awaiting client approval',3);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const releaseFunds=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.releaseFunds({gasLimit:200000,...gas});
      setTxPending({action:'Releasing Funds…',hash:t.hash});
      await t.wait();
      await afterTx('Funds released to Specialist ✓',5);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const requestRefund=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.requestRefund({gasLimit:200000,...gas});
      setTxPending({action:'Requesting Refund…',hash:t.hash});
      await t.wait();
      // Immediately update local state — don't wait for next poll
      setRefundRequestedVaults(prev=>{const n=new Set(prev);n.add(v.address.toLowerCase());return n;});
      await afterTx('Refund requested — Specialist can now approve');
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const approveRefund=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.approveRefund({gasLimit:200000,...gas});
      setTxPending({action:'Approving Refund…',hash:t.hash});
      await t.wait();
      await afterTx('Refund approved — USDC returned to Client',6);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const raiseDispute=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.dispute({gasLimit:200000,...gas});
      setTxPending({action:'Raising Dispute…',hash:t.hash});
      await t.wait();
      await afterTx('Dispute raised — Admin will arbitrate',4);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const cancelVault=async(v:Vault)=>{
    setLoading(true);
    try{
      const vault=await getVC(v.address);
      const gas=await getGasParams(getProvider());
      const t=await vault.cancelVault({gasLimit:200000,...gas});
      setTxPending({action:'Cancelling Vault…',hash:t.hash});
      await t.wait();
      await afterTx('Vault cancelled',7);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  // ── Header ────────────────────────────────────────────────────────────────
  const Hdr=()=>(
    <>
      {showN&&<div style={{position:'fixed',inset:0,zIndex:198,cursor:'default'}} onClick={()=>setShowN(false)}/>}
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:200,background:d?'rgba(8,8,11,0.88)':'rgba(248,249,250,0.92)',backdropFilter:'blur(22px)',borderBottom:`1px solid ${cardB}`,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',height:62}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>setPage('landing')}>
            <Logo size={30}/><span style={{...mono,fontWeight:700,fontSize:15,color:em,letterSpacing:'0.06em'}}>ArcSentry</span>
          </div>
          {wallet&&chainOk&&(
            <div style={{display:'flex',gap:2}}>
              {(['landing','dashboard','history'] as const).map(p=>(
                <button key={p} style={{background:page===p?'rgba(0,255,148,0.09)':'transparent',color:page===p?em:sub,border:'none',borderRadius:6,padding:'6px 13px',cursor:'pointer',fontSize:13,fontWeight:page===p?600:400}} onClick={()=>setPage(p)}>
                  {p==='landing'?'Home':p==='dashboard'?'Dashboard':'History'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>setDark(x=>!x)} style={{background:iB,border:`1px solid ${cardB}`,borderRadius:20,padding:'5px 13px',cursor:'pointer',color:tx,fontSize:12}}>{d?'☀️ Light':'🌙 Night'}</button>
          {wallet&&(
            <div style={{position:'relative',zIndex:199}}>
              <button style={{background:iB,border:`1px solid ${cardB}`,borderRadius:8,padding:'5px 12px',cursor:'pointer',color:tx,fontSize:15,position:'relative'}} onClick={()=>setShowN(x=>!x)}>
                🔔{unread>0&&<span style={{position:'absolute',top:-4,right:-4,background:em,color:'#000',borderRadius:'50%',width:16,height:16,fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{unread}</span>}
              </button>
              {showN&&(
                <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,...cardS,width:330,maxHeight:380,overflowY:'auto',zIndex:300}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 16px',borderBottom:`1px solid ${cardB}`}}>
                    <span style={{fontWeight:700,fontSize:13}}>Notifications</span>
                    <button style={{...btn('ghost'),padding:'3px 10px',fontSize:11}} onClick={()=>setNotifs(n=>n.map(x=>({...x,read:true})))}>Mark all read</button>
                  </div>
                  {notifs.length===0&&<div style={{padding:'20px 16px',color:sub,fontSize:13,textAlign:'center'}}>No notifications yet</div>}
                  {notifs.map(n=>(
                    <div key={n.id} style={{padding:'11px 16px',borderBottom:`1px solid ${cardB}`,opacity:n.read?0.4:1}}>
                      <div style={{fontSize:12,lineHeight:1.55,color:tx}}>{n.text}</div>
                      <div style={{fontSize:11,color:sub,marginTop:3}}>{n.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!wallet?(
            <button style={btn('primary')} onClick={connectWallet}>Connect Wallet</button>
          ):!chainOk?(
            <button style={btn('danger')} onClick={switchArc}>Switch to Arc Testnet</button>
          ):(
            <div style={{...cardS,padding:'5px 13px',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:em,boxShadow:`0 0 7px ${em}`}}/>
              <span style={{...mono,fontSize:12,color:sub}}>{fmt(wallet)}</span>
              <span style={{fontSize:10,color:em,fontWeight:700}}>Arc</span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const WrongNet=()=>wrongNet?(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',backdropFilter:'blur(10px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{...cardS,padding:40,maxWidth:380,textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:14}}>⚠️</div>
        <h2 style={{color:'#F87171',margin:'0 0 10px',fontWeight:800,fontSize:22}}>Wrong Network</h2>
        <p style={{color:sub,marginBottom:24,lineHeight:1.65,fontSize:14}}>Switch to Arc Testnet (Chain ID 5042002) to use ArcSentry.</p>
        <button style={{...btn('primary'),width:'100%',padding:'12px 20px'}} onClick={switchArc}>Switch to Arc Testnet</button>
      </div>
    </div>
  ):null;

  const TxToast=()=>txPending?(
    <div style={{position:'fixed',bottom:24,right:24,zIndex:600,...cardS,padding:'15px 20px',minWidth:290,borderColor:'rgba(0,255,148,0.3)',animation:'arcslide 0.3s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:18,height:18,border:`2px solid ${em}`,borderTopColor:'transparent',borderRadius:'50%',animation:'arcspin 0.9s linear infinite',flexShrink:0}}/>
        <div><div style={{fontWeight:600,fontSize:13}}>Transaction Pending</div><div style={{color:sub,fontSize:11,marginTop:2}}>{txPending.action}</div></div>
        <a href={exTx(txPending.hash)} target="_blank" rel="noreferrer" style={{color:em,fontSize:11,marginLeft:'auto',textDecoration:'none'}}>View ↗</a>
      </div>
    </div>
  ):null;

  const Perimeter=()=>(
    <div style={{...cardS,overflow:'hidden'}}>
      {perimeter.length===0?(
        <div style={{padding:'28px 20px',textAlign:'center',color:sub,fontSize:13}}>No settled vaults yet — activity appears here after completions, refunds, or disputes.</div>
      ):perimeter.map((ev,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'13px 20px',borderBottom:i<perimeter.length-1?`1px solid ${cardB}`:'none'}}>
          <span style={{...mono,fontSize:12,color:em,minWidth:100}}>{fmt(ev.vaultAddr)}</span>
          <Badge s={ev.action}/>
          <span style={{...mono,fontSize:14,fontWeight:700,marginLeft:'auto'}}>${fmtUsdc(ev.amount)}</span>
          <a href={exAddr(ev.vaultAddr)} target="_blank" rel="noreferrer" style={{fontSize:11,color:sub,textDecoration:'none'}}>↗</a>
        </div>
      ))}
    </div>
  );

  // ── Landing ───────────────────────────────────────────────────────────────
  const Landing=()=>(
    <div style={{paddingTop:62}}>
      <div style={{minHeight:'91vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'80px 24px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,opacity:0.035,backgroundImage:`linear-gradient(${em} 1px,transparent 1px),linear-gradient(90deg,${em} 1px,transparent 1px)`,backgroundSize:'44px 44px',pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'40%',left:'50%',transform:'translate(-50%,-50%)',width:700,height:700,borderRadius:'50%',background:`radial-gradient(circle,rgba(0,255,148,0.055) 0%,transparent 68%)`,pointerEvents:'none'}}/>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,marginBottom:22,background:'rgba(0,255,148,0.09)',border:'1px solid rgba(0,255,148,0.22)',borderRadius:20,padding:'5px 15px',fontSize:11.5,color:em,fontWeight:700,...mono}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:em,boxShadow:`0 0 8px ${em}`,display:'inline-block',animation:'arcpulse 1.8s infinite'}}/>LIVE — Arc Testnet
        </div>
        <h1 style={{fontSize:'clamp(38px,6.5vw,76px)',fontWeight:900,margin:'0 0 18px',lineHeight:1.06,letterSpacing:'-0.03em'}}>Trustless Deals.<br/><span style={{color:em}}>Secured by Arc.</span></h1>
        <p style={{maxWidth:500,color:sub,lineHeight:1.72,fontSize:'clamp(14px,2vw,17px)',margin:'0 0 38px'}}>ArcSentry is a decentralized escrow protocol on Arc Network. Lock USDC in a <strong style={{color:tx}}>Vault</strong> - release only when the work ships. No middlemen.</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
          {!wallet?(<button style={{...btn('primary'),padding:'13px 30px',fontSize:15}} onClick={connectWallet}>Connect & Start</button>
          ):chainOk?(<button style={{...btn('primary'),padding:'13px 30px',fontSize:15}} onClick={()=>setPage('dashboard')}>Open Dashboard →</button>
          ):(<button style={{...btn('danger'),padding:'13px 30px',fontSize:15}} onClick={switchArc}>Switch to Arc Testnet</button>)}
          <button style={{...btn('secondary'),padding:'13px 30px',fontSize:15}} onClick={()=>document.getElementById('gs')?.scrollIntoView({behavior:'smooth'})}>How it works</button>
        </div>
        <div style={{display:'flex',gap:52,marginTop:68,flexWrap:'wrap',justifyContent:'center'}}>
          {[
            {label:'Total Value Guarded',val:wallet&&chainOk?`$${tvg.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`:`$${tvg.toLocaleString()}`,m:true},
            {label:'Vaults Settled',val:vc.toLocaleString(),m:true},
            {label:'Avg. Settlement',val:'< 1s',m:false}
          ].map(s=>(
            <div key={s.label} style={{textAlign:'center'}}>
              <div style={{fontSize:'clamp(26px,4vw,40px)',fontWeight:800,color:em,...(s.m?mono:{})}}>{s.val}</div>
              <div style={{fontSize:12.5,color:sub,marginTop:5}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div id="gs" style={{padding:'80px 24px',maxWidth:880,margin:'0 auto'}}>
        <h2 style={{textAlign:'center',fontSize:30,fontWeight:800,margin:'0 0 10px'}}>How a Vault Works</h2>
        <p style={{textAlign:'center',color:sub,marginBottom:52,fontSize:15}}>Three steps. Total clarity. No surprises.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:22}}>
          {[{n:'01',icon:'🏗️',title:'Initiate',desc:"Create a Vault with the Specialist's wallet, USDC amount, and deliverable.",color:'#60A5FA'},
            {n:'02',icon:'🔐',title:'Lock',desc:'Specialist accepts. You fund. USDC moves to the contract and is locked until settlement.',color:em},
            {n:'03',icon:'⚖️',title:'Settlement',desc:'Work done → release. Not happy → request refund. Stuck → raise a dispute.',color:'#FBBF24'}
          ].map(s=>(
            <div key={s.n} style={{...cardS,padding:26,borderColor:`${s.color}1A`,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:12,right:16,...mono,fontSize:52,fontWeight:900,opacity:0.055,color:s.color}}>{s.n}</div>
              <div style={{fontSize:30,marginBottom:14}}>{s.icon}</div>
              <h3 style={{margin:'0 0 10px',color:s.color,fontWeight:700,fontSize:17}}>{s.title}</h3>
              <p style={{color:sub,lineHeight:1.65,margin:0,fontSize:13.5}}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {wallet&&chainOk&&perimeter.length>0&&(
        <div style={{padding:'0 24px 80px',maxWidth:760,margin:'0 auto'}}>
          <h3 style={{textAlign:'center',fontWeight:700,marginBottom:22,fontSize:18}}>The Perimeter <span style={{marginLeft:10,fontSize:10,color:em,...mono,background:'rgba(0,255,148,0.1)',padding:'2px 8px',borderRadius:4}}>LIVE</span></h3>
          <Perimeter/>
        </div>
      )}
    </div>
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const Dashboard=()=>{
    const active=vaults.filter(v=>v.status<5&&v.status!==7);
    return(
      <div style={{paddingTop:62,padding:'78px 24px 48px',maxWidth:1180,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:30,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 5px'}}>Active Vaults</h1>
            <p style={{color:sub,margin:0,fontSize:13.5}}>Live deals only — see History for completed and cancelled vaults</p>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {vaultsLoading&&<span style={{color:sub,fontSize:12,...mono}}>Syncing…</span>}
            <button style={btn('ghost')} onClick={()=>wallet&&loadVaults(wallet,true)}>↻ Refresh</button>
            <Tip text="Create a new escrow deal as Client">
              <button style={{...btn('primary'),padding:'11px 22px'}} onClick={()=>setShowCreate(true)}>+ New Vault</button>
            </Tip>
          </div>
        </div>
        {active.length===0?(
          <div style={{...cardS,padding:60,textAlign:'center'}}>
            <div style={{fontSize:42,marginBottom:16}}>🏗️</div>
            <p style={{color:sub,fontSize:15,margin:'0 0 20px'}}>{vaultsLoading?'Loading your vaults…':'No active vaults. Create one or check History for past deals.'}</p>
            {!vaultsLoading&&<button style={btn('primary')} onClick={()=>setShowCreate(true)}>+ Create First Vault</button>}
          </div>
        ):(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:18,marginBottom:46}}>
            {active.map(v=>(
              <div key={v.address} style={{...cardS,padding:22,cursor:'pointer',transition:'all 0.2s ease'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='rgba(0,255,148,0.22)';(e.currentTarget as HTMLDivElement).style.transform='translateY(-2px)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=cardB;(e.currentTarget as HTMLDivElement).style.transform='none';}}
                onClick={()=>{setSelected(v);setPage('detail');}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <span style={{...mono,fontSize:11,color:em,fontWeight:700}}>{fmt(v.address)}</span>
                  <Badge s={VS[v.status]}/>
                </div>
                <p style={{fontSize:13.5,color:tx,margin:'0 0 16px',lineHeight:1.55,fontWeight:500}}>{v.description}</p>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                  <div>
                    <div style={{fontSize:11,color:sub,marginBottom:2}}>Amount</div>
                    <div style={{...mono,fontSize:19,fontWeight:800}}>${fmtUsdc(v.amount)} <span style={{fontSize:11,color:sub,fontWeight:400}}>USDC</span></div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:sub,marginBottom:2}}>{wallet?.toLowerCase()===v.client.toLowerCase()?'You are Client':'You are Specialist'}</div>
                    <div style={{...mono,fontSize:11,color:sub}}>{wallet?.toLowerCase()===v.client.toLowerCase()?`Spec: ${fmt(v.specialist)}`:`Client: ${fmt(v.client)}`}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {perimeter.length>0&&(
          <>
            <h2 style={{fontSize:19,fontWeight:700,marginBottom:18}}>The Perimeter — Public Ledger <span style={{marginLeft:8,fontSize:10,color:em,...mono,background:'rgba(0,255,148,0.1)',padding:'2px 8px',borderRadius:4}}>LIVE</span></h2>
            <Perimeter/>
          </>
        )}
      </div>
    );
  };

  // ── Detail ────────────────────────────────────────────────────────────────
  const Detail=()=>{
    const v=selected; if(!v) return null;
    const isClient     = wallet?.toLowerCase()===v.client.toLowerCase();
    const isSpecialist = wallet?.toLowerCase()===v.specialist.toLowerCase();
    const hasRefund    = refundRequestedVaults.has(v.address.toLowerCase());

    const steps=[
      {l:'Vault Created',ok:true},
      {l:'Specialist Accepted',ok:v.status>=1},
      {l:'Client Funded',ok:v.status>=2},
      {l:'Release Requested',ok:v.status===3||v.status===5},
      {l:'Settlement',ok:v.status===5||v.status===6},
    ];

    return(
      <div style={{paddingTop:62,padding:'78px 24px 56px',maxWidth:760,margin:'0 auto'}}>
        <div style={{display:'flex',gap:12,marginBottom:22,alignItems:'center'}}>
          <button style={btn('ghost')} onClick={()=>setPage('dashboard')}>← Dashboard</button>
          <button style={{...btn('ghost'),fontSize:12,padding:'6px 14px'}} onClick={()=>wallet&&loadVaults(wallet,true)}>↻ Refresh</button>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28,flexWrap:'wrap',gap:16}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
              <h1 style={{fontSize:22,fontWeight:800,margin:0,...mono}}>{fmt(v.address)}</h1>
              <Badge s={VS[v.status]}/>
            </div>
            <p style={{color:sub,margin:0,fontSize:13.5}}>{v.description}</p>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:sub}}>Vault Amount</div>
            <div style={{...mono,fontSize:34,fontWeight:800,color:em}}>${fmtUsdc(v.amount)}</div>
            <div style={{fontSize:11,color:sub}}>USDC</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:26}}>
          {[{role:'Client (Buyer)',addr:v.client,icon:'👤',isYou:isClient},{role:'Specialist (Seller)',addr:v.specialist,icon:'🔧',isYou:isSpecialist}].map(p=>(
            <div key={p.role} style={{...cardS,padding:18}}>
              <div style={{fontSize:22,marginBottom:8}}>{p.icon}</div>
              <div style={{fontSize:11,color:sub,marginBottom:4}}>{p.role} {p.isYou&&<span style={{color:em,fontWeight:700}}>(You)</span>}</div>
              <a href={exAddr(p.addr)} target="_blank" rel="noreferrer" style={{...mono,fontSize:12,color:tx,textDecoration:'none'}}>{fmt(p.addr)} ↗</a>
            </div>
          ))}
        </div>

        <div style={{...cardS,padding:26,marginBottom:24}}>
          <h3 style={{margin:'0 0 22px',fontWeight:700,fontSize:16}}>The Handshake — Timeline</h3>
          <div style={{position:'relative'}}>
            <div style={{position:'absolute',left:11,top:0,bottom:0,width:2,background:`linear-gradient(${em}45,${cardB})`}}/>
            {steps.map((s,i)=>(
              <div key={i} style={{display:'flex',gap:18,marginBottom:i<steps.length-1?22:0,position:'relative'}}>
                <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,background:s.ok?em:iB,border:`2px solid ${s.ok?em:cardB}`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:s.ok?`0 0 14px ${em}55`:'none',zIndex:1}}>
                  {s.ok&&<span style={{fontSize:11,color:'#000',fontWeight:800}}>✓</span>}
                </div>
                <div style={{paddingTop:3}}><div style={{fontWeight:600,fontSize:13.5,color:s.ok?tx:sub}}>{s.l}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{...cardS,padding:24}}>
          <h3 style={{margin:'0 0 18px',fontWeight:700,fontSize:16}}>Actions</h3>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>

            {/* STATUS 0: Draft */}
            {v.status===0&&isSpecialist&&<Tip text="Accept — commit to delivering."><button style={btn('primary')} disabled={loading} onClick={()=>acceptVault(v)}>Accept Vault</button></Tip>}
            {v.status===0&&(isClient||isSpecialist)&&<Tip text="Cancel — no USDC at risk yet."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>}

            {/* STATUS 1: Accepted */}
            {v.status===1&&isClient&&(
              <div style={{display:'flex',flexDirection:'column',gap:8,width:'100%'}}>
                <div style={{...cardS,padding:'10px 14px',borderColor:'rgba(0,255,148,0.2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:12,color:sub}}>Your USDC Balance</span>
                  <span style={{...mono,fontSize:13,fontWeight:700,color:usdcBalance>=v.amount?em:'#F87171'}}>
                    ${(Number(usdcBalance)/1e6).toFixed(2)}
                    {usdcBalance<v.amount&&<span style={{fontSize:11,color:'#F87171',marginLeft:8}}>⚠ Insufficient</span>}
                  </span>
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  <Tip text={usdcBalance>=v.amount?"Fund — USDC moves to contract and is locked.":"Insufficient — get testnet USDC at faucet.circle.com"}>
                    <button style={{...btn('primary'),opacity:usdcBalance<v.amount?0.55:1}} disabled={loading} onClick={()=>fundVault(v)}>Fund Vault</button>
                  </Tip>
                  <Tip text="Cancel — no USDC at risk."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>
                </div>
              </div>
            )}
            {v.status===1&&isSpecialist&&<Tip text="Cancel — no USDC at risk."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>}

            {/* STATUS 2: Funded */}
            {v.status===2&&isSpecialist&&<Tip text="Work done — request payment from client."><button style={btn('primary')} disabled={loading} onClick={()=>requestRelease(v)}>Request Release</button></Tip>}
            {v.status===2&&isSpecialist&&hasRefund&&<Tip text="Client requested a refund — approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button></Tip>}
            {v.status===2&&isClient&&<Tip text="Signal refund — Specialist must approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button></Tip>}
            {v.status===2&&(isClient||isSpecialist)&&<Tip text="Escalate to Admin — funds frozen pending arbitration."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}>Raise Dispute</button></Tip>}

            {/* STATUS 3: Release Requested */}
            {v.status===3&&isClient&&<Tip text="Approve — USDC sent to Specialist. Irreversible."><button style={btn('primary')} disabled={loading} onClick={()=>releaseFunds(v)}>Release Funds ✓</button></Tip>}
            {v.status===3&&isClient&&<Tip text="Signal refund — Specialist must approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button></Tip>}
            {v.status===3&&isClient&&<Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}>Raise Dispute</button></Tip>}
            {v.status===3&&isSpecialist&&hasRefund&&(
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <Tip text="Client requested a refund — approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button></Tip>
    <Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}>Raise Dispute</button></Tip>
  </div>
)}
            {v.status===3&&isSpecialist&&!hasRefund&&(
  <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
    <span style={{color:sub,fontSize:13,padding:'10px 0',display:'flex',alignItems:'center',gap:6}}>
      <span style={{opacity:0.5}}>⏳</span> Awaiting client decision — release or refund
    </span>
    <Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}>Raise Dispute</button></Tip>
  </div>
)}

            {/* STATUS 4: Disputed — full consensual resolution for both sides */}
            {v.status===4&&(
              <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%'}}>
                <div style={{...cardS,padding:'12px 16px',borderColor:'rgba(248,113,113,0.3)',display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:16}}>⚠️</span>
                  <span style={{color:'#F87171',fontSize:13,fontWeight:600}}>Dispute active — Admin reviewing. You can still resolve between yourselves below.</span>
                </div>
                {isClient&&(
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <Tip text="Mutually agreed — release funds to Specialist.">
                      <button style={btn('primary')} disabled={loading} onClick={()=>releaseFunds(v)}>Release Funds ✓</button>
                    </Tip>
                    <Tip text="Signal refund — Specialist must approve.">
                      <button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button>
                    </Tip>
                  </div>
                )}
                {isSpecialist&&(
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <Tip text="Mutually agreed — request release so client can approve.">
                      <button style={btn('primary')} disabled={loading} onClick={()=>requestRelease(v)}>Request Release</button>
                    </Tip>
                    {hasRefund&&(
                      <Tip text="Client requested refund — approve to return USDC.">
                        <button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button>
                      </Tip>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Terminal states */}
            {v.status===5&&<span style={{color:em,fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:8}}>✓ Completed — USDC released to Specialist</span>}
            {v.status===6&&<span style={{color:'#A78BFA',fontWeight:700,fontSize:14}}>↩ Refunded — USDC returned to Client</span>}
            {v.status===7&&<span style={{color:sub,fontSize:14}}>Vault cancelled.</span>}
          </div>

          <div style={{marginTop:20,paddingTop:20,borderTop:`1px solid ${cardB}`}}>
            <div style={{fontSize:11,color:sub,marginBottom:4}}>Vault Contract</div>
            <a href={exAddr(v.address)} target="_blank" rel="noreferrer" style={{...mono,fontSize:12,color:em,textDecoration:'none'}}>{v.address} ↗</a>
          </div>
        </div>
      </div>
    );
  };

  // ── Create modal ──────────────────────────────────────────────────────────
  const CreateModal=()=>showCreate?(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(10px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}
      onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}>
      <div style={{...cardS,padding:34,width:'100%',maxWidth:460}}>
        <h2 style={{margin:'0 0 5px',fontWeight:800}}>Create New Vault</h2>
        <p style={{color:sub,marginBottom:26,fontSize:13.5}}>Once funded, USDC is locked until settlement.</p>
        <div style={{display:'flex',flexDirection:'column',gap:15}}>
          <div>
            <label style={{fontSize:12,color:sub,display:'block',marginBottom:5}}>Specialist Wallet Address</label>
            <input ref={specRef} style={inputS} placeholder="0x..."/>
          </div>
          <div>
            <label style={{fontSize:12,color:sub,display:'block',marginBottom:5}}>Amount (USDC)</label>
            <input ref={amtRef} style={inputS} placeholder="e.g. 500" type="number" min="1"/>
            <div style={{fontSize:11,color:sub,marginTop:4}}>Gas fees paid in USDC on Arc.</div>
          </div>
          <div>
            <label style={{fontSize:12,color:sub,display:'block',marginBottom:5}}>Service Description</label>
            <textarea ref={descRef} style={{...inputS,resize:'vertical',minHeight:80}} placeholder="Describe the deliverable clearly..."/>
          </div>
          <div style={{display:'flex',gap:10,marginTop:6}}>
            <button style={{...btn('primary'),flex:1,opacity:loading?0.5:1}} onClick={createVault} disabled={loading}>
              {loading?'Creating…':'Create Vault'}
            </button>
            <button style={btn('ghost')} onClick={()=>setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  ):null;

  // ── History ───────────────────────────────────────────────────────────────
  const History=()=>{
    const settled=vaults.filter(v=>v.status===5||v.status===6||v.status===7);
    const active=vaults.filter(v=>v.status<5&&v.status!==7);
    return(
      <div style={{paddingTop:62,padding:'78px 24px 48px',maxWidth:860,margin:'0 auto'}}>
        <div style={{marginBottom:30}}>
          <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 5px'}}>Vault History</h1>
          <p style={{color:sub,margin:0,fontSize:13.5}}>All vaults associated with your wallet</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:32}}>
          {[{label:'Total Vaults',val:vaults.length,color:undefined},{label:'Active',val:active.length,color:'#00FF94'},{label:'Settled / Cancelled',val:settled.length,color:'#A78BFA'}].map(s=>(
            <div key={s.label} style={{...cardS,padding:'18px 22px'}}>
              <div style={{fontSize:28,fontWeight:800,color:s.color||tx,...mono}}>{s.val}</div>
              <div style={{fontSize:12,color:sub,marginTop:4}}>{s.label}</div>
            </div>
          ))}
        </div>
        {vaults.length===0?(
          <div style={{...cardS,padding:50,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>📭</div>
            <p style={{color:sub,fontSize:14}}>{vaultsLoading?'Loading…':'No vaults found. Create your first one from the Dashboard.'}</p>
          </div>
        ):(
          <div style={{...cardS,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr',gap:12,padding:'12px 20px',borderBottom:`1px solid ${cardB}`,opacity:0.5}}>
              {['Vault','Description','Amount','Status'].map(h=><div key={h} style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>)}
            </div>
            {vaults.map((v,i)=>(
              <div key={v.address} style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr',gap:12,padding:'14px 20px',borderBottom:i<vaults.length-1?`1px solid ${cardB}`:'none',cursor:'pointer',transition:'background 0.15s ease'}}
                onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background=iB}
                onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background='transparent'}
                onClick={()=>{setSelected(v);setPage('detail');}}>
                <div style={{...mono,fontSize:12,color:em}}>{fmt(v.address)}</div>
                <div style={{fontSize:13,color:tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.description}</div>
                <div style={{...mono,fontSize:13,fontWeight:700}}>${fmtUsdc(v.amount)}</div>
                <div><Badge s={VS[v.status]}/></div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return(
    <div style={{minHeight:'100vh',background:bg,color:tx,fontFamily:"'Inter',sans-serif",transition:'background 0.45s ease',position:'relative'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}body{overflow-x:hidden;}
        @keyframes arcpulse{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes arcfade{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
        @keyframes arcslide{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes arcspin{to{transform:rotate(360deg)}}
        button{transition:all 0.16s ease;}
        button:hover:not(:disabled){opacity:0.87;transform:translateY(-1px);}
        button:active:not(:disabled){transform:translateY(0);}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(0,255,148,0.2);border-radius:4px}
      `}</style>
      <Hdr/><WrongNet/><TxToast/><CreateModal/>
      {page==='landing'   && <Landing/>}
      {page==='dashboard' && <Dashboard/>}
      {page==='detail'    && <Detail/>}
      {page==='history'   && <History/>}
    </div>
  );
}
