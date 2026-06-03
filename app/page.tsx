'use client';

// wallet managed via window.ethereum directly
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ethers } from 'ethers';
import FactoryABI from './abis/ArcSentryFactory.json';
import VaultABI from './abis/ArcSentryVault.json';

// ── Circle wallet helpers ─────────────────────────────────────────────────
const circleAPI = async (action: string, params = {}) => {
  const res = await fetch('/api/circle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Circle API failed');
  return data;
};

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
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};

const VS: Record<number, string> = {
  0:'Draft', 1:'Accepted', 2:'Funded',
  3:'Release Requested', 4:'Disputed',
  5:'Completed', 6:'Refunded', 7:'Cancelled',
};

const statusCfg: Record<string,{color:string;bg:string;border:string;pulse:boolean}> = {
  'Draft':             {color:'#9CA3AF', bg:'rgba(156,163,175,0.08)', border:'rgba(156,163,175,0.2)',  pulse:false},
  'Accepted':          {color:'#60A5FA', bg:'rgba(96,165,250,0.10)',  border:'rgba(96,165,250,0.25)',  pulse:false},
  'Funded':            {color:'#00C97A', bg:'rgba(0,201,122,0.10)',   border:'rgba(0,201,122,0.3)',    pulse:true },
  'Release Requested': {color:'#F59E0B', bg:'rgba(245,158,11,0.10)', border:'rgba(245,158,11,0.25)',  pulse:false},
  'Disputed':          {color:'#EF4444', bg:'rgba(239,68,68,0.10)',   border:'rgba(239,68,68,0.25)',   pulse:false},
  'Completed':         {color:'#00C97A', bg:'rgba(0,201,122,0.08)',   border:'rgba(0,201,122,0.2)',    pulse:false},
  'Refunded':          {color:'#F59E0B', bg:'rgba(245,158,11,0.10)', border:'rgba(245,158,11,0.2)',   pulse:false},
  'Cancelled':         {color:'#EF4444', bg:'rgba(239,68,68,0.07)',   border:'rgba(239,68,68,0.18)',   pulse:false},
};

interface Vault {
  address:string; client:string; specialist:string;
  amount:bigint; description:string; status:number; createdAt:bigint;
  deadline:bigint; refundRequestedAt:bigint; releaseRequestedAt:bigint;
}
interface PerimeterEvent {
  vaultAddr:string; action:string; amount:bigint; timestamp:number; description:string;
}

// ── Deadline utilities ────────────────────────────────────────────────────────
const fmtDeadline = (deadline:bigint):string => {
  if(!deadline || deadline === 0n) return '';
  const now  = Math.floor(Date.now()/1000);
  const end  = Number(deadline);
  const diff = end - now;
  if(diff <= 0) return 'Expired';
  const days  = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins  = Math.floor((diff % 3600) / 60);
  if(days > 1)  return `Expires in ${days}d ${hours}h ${mins}m`;
  if(days === 1) return `Expires in 1d ${hours}h ${mins}m`;
  if(hours > 0) return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
};

const fmtDeadlineDate = (deadline:bigint):string => {
  if(!deadline || deadline === 0n) return '';
  return new Date(Number(deadline)*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
};

const isExpiredLocal = (deadline:bigint):boolean => {
  if(!deadline || deadline === 0n) return false;
  return Math.floor(Date.now()/1000) > Number(deadline);
};

const fmt     = (a:string) => `${a.slice(0,6)}...${a.slice(-4)}`;
const fmtUsdc = (r:bigint) => (Number(r)/1e6).toLocaleString('en-US',{minimumFractionDigits:2});
const exAddr  = (a:string) => `https://testnet.arcscan.app/address/${a}`;
const exTx    = (h:string) => `https://testnet.arcscan.app/tx/${h}`;

const getGasParams = async (provider: ethers.BrowserProvider) => {
  return {}; // Let Privy handle gas and nonce automatically
};

// ── SVG Icons ────────────────────────────────────────────────────────────────
const Logo = ({size=32}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{flexShrink:0}}>
    <defs>
      <filter id="glow-lg">
        <feGaussianBlur stdDeviation="2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path d="M20 3 L37 15 L37 29 L20 37 L3 29 L3 15 Z" stroke="#00C97A" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    <path d="M11 15 Q20 8 29 15" stroke="#00C97A" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M9 21 Q20 12 31 21" stroke="#00C97A" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.4"/>
    <line x1="20" y1="9" x2="20" y2="31" stroke="#00C97A" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="20" cy="20" r="2.5" fill="#00C97A" filter="url(#glow-lg)"/>
  </svg>
);

const IconVault = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="3"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="5" x2="12" y2="2"/>
    <line x1="17" y1="7" x2="19" y2="5"/>
    <line x1="7" y1="7" x2="5" y2="5"/>
  </svg>
);

const IconShield = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

const IconZap = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const IconScale = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="3" x2="12" y2="21"/>
    <path d="M3 9l9-7 9 7"/>
    <path d="M5 9H3l2 6a4 4 0 0 0 8 0l2-6h-2"/>
    <path d="M19 9h-2l2 6a4 4 0 0 0 8 0l2-6h-2" transform="translate(-8,0)"/>
  </svg>
);

const IconLock = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconArrowRight = ({size=16,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconExternalLink = ({size=13,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const IconCheck = ({size=14,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconRefresh = ({size=15,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconUser = ({size=16,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconTool = ({size=16,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const IconWarning = ({size=16,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconPlus = ({size=15,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconChevronDown = ({size=14,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconInbox = ({size=40,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
  </svg>
);

const IconBuildingBlocks = ({size=40,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const IconMenu = ({size=20,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const IconClose = ({size=18,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Deadline Countdown ────────────────────────────────────────────────────────
const DeadlineCountdown = ({deadline,sub,em}:{deadline:bigint;sub:string;em:string}) => {
  const [label,setLabel] = useState(fmtDeadline(deadline));
  const expired = isExpiredLocal(deadline);
  useEffect(()=>{
    const id = setInterval(()=>setLabel(fmtDeadline(deadline)),30000);
    return()=>clearInterval(id);
  },[deadline]);
  if(!deadline || deadline === 0n) return null;
  return(
    <div style={{
      display:'inline-flex',alignItems:'center',gap:5,
      background:expired?'rgba(239,68,68,0.08)':'rgba(245,158,11,0.08)',
      border:`1px solid ${expired?'rgba(239,68,68,0.2)':'rgba(245,158,11,0.2)'}`,
      borderRadius:6,padding:'3px 9px',
      fontSize:10,fontWeight:600,
      color:expired?'#EF4444':'#F59E0B',
      fontFamily:'var(--font-mono)'
    }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {label}
    </div>
  );
};

// ── Timeout Countdown ─────────────────────────────────────────────────────────
const TimeoutCountdown = ({requestedAt, type, isSpecialist}:{requestedAt:bigint;type:'refund'|'release';isSpecialist:boolean}) => {
  const TIMEOUT = 5*24*60*60;
  const calcLabel = () => {
    const ts = requestedAt && requestedAt > 0n
      ? Number(requestedAt)
      : Math.floor(Date.now()/1000);
    const end  = ts + TIMEOUT;
    const now  = Math.floor(Date.now()/1000);
    const diff = end - now;
    if(diff <= 0) return type==='refund'
      ? 'Refund timeout elapsed - Client can claim automatically'
      : 'Release timeout elapsed - Specialist can claim automatically';
    const days  = Math.floor(diff/86400);
    const hours = Math.floor((diff%86400)/3600);
    const mins  = Math.floor((diff%3600)/60);
    const timeStr = `${days>0?`${days}d `:''}${hours>0?`${hours}h `:''}${mins}m`;
    if(type==='refund'){
      return isSpecialist
        ? `Refund requested - approve, dispute, or Client auto-claims in ${timeStr}`
        : `Awaiting Specialist action - auto-refund triggers in ${timeStr} if no response`;
    } else {
      return isSpecialist
        ? `Awaiting Client action - auto-release triggers in ${timeStr} if no response`
        : `Release requested - approve, dispute, or Specialist auto-claims in ${timeStr}`;
    }
  };
  const [label, setLabel] = useState(calcLabel);
  useEffect(()=>{
    const id = setInterval(()=>setLabel(calcLabel()),60000);
    return()=>clearInterval(id);
  },[requestedAt]);
  const elapsed = (()=>{
    const ts = requestedAt && requestedAt > 0n ? Number(requestedAt) : Math.floor(Date.now()/1000);
    return Math.floor(Date.now()/1000) > ts + TIMEOUT;
  })();
  return(
    <div style={{
      marginTop:10,padding:'11px 14px',
      background:'rgba(245,158,11,0.06)',
      border:'1px solid rgba(245,158,11,0.2)',
      borderRadius:9,fontSize:12.5,lineHeight:1.6,
      display:'flex',alignItems:'flex-start',gap:8,
      color:'#F59E0B'
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}>
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      {label}
    </div>
  );
};
// ── Badge ─────────────────────────────────────────────────────────────────────
const Badge = ({s}:{s:string}) => {
  const cfg = statusCfg[s] || statusCfg['Draft'];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      background:cfg.bg, color:cfg.color,
      border:`1px solid ${cfg.border}`,
      borderRadius:20, padding:'3px 10px',
      fontSize:11, fontFamily:'var(--font-mono)',
      fontWeight:700, letterSpacing:'0.04em', whiteSpace:'nowrap'
    }}>
      {cfg.pulse && (
        <span style={{
          width:5, height:5, borderRadius:'50%',
          background:cfg.color, display:'inline-block',
          animation:'pulse-dot 1.8s ease-in-out infinite'
        }}/>
      )}
      {s}
    </span>
  );
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tip = ({text,children}:{text:string;children:React.ReactNode}) => {
  const [v,setV] = useState(false);
  return (
    <span style={{position:'relative',display:'inline-block'}}
      onMouseEnter={()=>setV(true)} onMouseLeave={()=>setV(false)}>
      {children}
      {v && (
        <span style={{
          position:'absolute', bottom:'calc(100% + 8px)', left:'50%',
          transform:'translateX(-50%)',
          background:'rgba(8,8,11,0.97)',
          border:'1px solid rgba(0,201,122,0.22)',
          borderRadius:8, padding:'7px 12px',
          fontSize:11.5, color:'#aaa',
          whiteSpace:'nowrap', zIndex:900,
          backdropFilter:'blur(10px)',
          pointerEvents:'none', lineHeight:1.5
        }}>{text}</span>
      )}
    </span>
  );
};

// ── FAQ Item ──────────────────────────────────────────────────────────────────
const FaqItem = ({q,a}:{q:string;a:string}) => {
  const [open,setOpen] = useState(false);
  const em = '#00C97A';
  return (
    <div style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
      <button
        onClick={()=>setOpen(x=>!x)}
        style={{
          width:'100%', display:'flex', justifyContent:'space-between',
          alignItems:'center', padding:'20px 0',
          background:'transparent', border:'none',
          color:'var(--tx-primary)', fontSize:14, fontWeight:600,
          textAlign:'left', gap:16
        }}>
        <span>{q}</span>
        <span style={{
          color:em, flexShrink:0,
          transform:open?'rotate(180deg)':'none',
          transition:'transform 0.2s ease'
        }}>
          <IconChevronDown size={16} color={em}/>
        </span>
      </button>
      {open && (
        <p style={{
          fontSize:13.5, color:'var(--tx-secondary)',
          lineHeight:1.75, paddingBottom:20,
          animation:'fade-up 0.2s ease'
        }}>{a}</p>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function ArcSentry() {
  const [dark, setDark]             = useState(true);
  const [page, setPage]             = useState<'landing'|'dashboard'|'detail'|'history'>('landing');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<Vault|null>(null);
  const [mobileNav, setMobileNav]   = useState(false);
  const [tvg, setTvg]               = useState(0);
  const [vc, setVc]                 = useState(0);
  const [wallet, setWallet] = useState<string|null>(null);
  const [chainOk, setChainOk]       = useState(false);
  const [wrongNet, setWrongNet]     = useState(false);
  const [vaults, setVaults]         = useState<Vault[]>([]);
  const [perimeter, setPerimeter]   = useState<PerimeterEvent[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [txPending, setTxPending]   = useState<{action:string;hash:string}|null>(null);
  const [notifs, setNotifs]         = useState<{id:number;text:string;read:boolean;time:string}[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n);
  const [refundRequestedVaults, setRefundRequestedVaults] = useState<Set<string>>(new Set());
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showCircleLogin, setShowCircleLogin] = useState(false);
  const [circleEmail, setCircleEmail]       = useState('');
  const [circleOtp, setCircleOtp]           = useState('');
  const [circleStep, setCircleStep]         = useState<'idle'|'otp'|'done'>('idle');
  const [circleLoading, setCircleLoading]   = useState(false);
  const [circleError, setCircleError]       = useState('');
  const [circleWalletId, setCircleWalletId] = useState<string|null>(null);
  const [walletType, setWalletType]         = useState<'evm'|'circle'|null>(null);

  const specRef = useRef<HTMLInputElement>(null);
const walletMenuRef = useRef<HTMLDivElement>(null);
useEffect(()=>{
  const handler = (e: MouseEvent) => {
    if(walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)){
      setShowWalletMenu(false);
    }
  };
  if(showWalletMenu) document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
},[showWalletMenu]);
const amtRef  = useRef<HTMLInputElement>(null);
const descRef = useRef<HTMLTextAreaElement>(null);
const [selectedDays, setSelectedDays] = useState(30);
const [createSpec, setCreateSpec] = useState('');
const [createAmt, setCreateAmt]   = useState('');
const [createDesc, setCreateDesc] = useState('');
const [customMode, setCustomMode] = useState(false);

  const pushNotif = (text:string) => setNotifs(n=>[{id:Date.now(),text,read:false,time:'just now'},...n]);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const em    = '#00C97A';
  const bg    = dark ? '#08080B'                    : '#F4F5F7';
  const card  = dark ? 'rgba(15,15,20,0.95)'        : 'rgba(255,255,255,0.96)';
  const cardB = dark ? 'rgba(255,255,255,0.07)'     : 'rgba(0,0,0,0.09)';
  const tx    = dark ? '#E0E0E0'                    : '#111111';
  const sub   = dark ? '#888888'                    : '#555555';
  const iB    = dark ? 'rgba(255,255,255,0.04)'     : 'rgba(0,0,0,0.04)';
  const iBo   = dark ? 'rgba(255,255,255,0.10)'     : 'rgba(0,0,0,0.12)';
  const surfaceCard  = dark ? '#0F0F14' : '#FFFFFF';
  const surfaceRaise = dark ? '#16161E' : '#F0F1F3';

  const cardS:React.CSSProperties = {
    background:card, border:`1px solid ${cardB}`,
    borderRadius:16, backdropFilter:'blur(20px)',
    transition:'border-color 0.2s ease'
  };

  // Button styles
  const btn = (v:'primary'|'secondary'|'ghost'|'danger'='primary'):React.CSSProperties => ({
    primary:   {background:'linear-gradient(135deg,#00C97A,#00A862)',color:'#000',border:'none',borderRadius:9,padding:'11px 22px',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'var(--font-sans)',transition:'all 0.18s ease',display:'inline-flex',alignItems:'center',gap:7},
    secondary: {background:'transparent',color:em,border:`1px solid rgba(0,201,122,0.35)`,borderRadius:9,padding:'11px 22px',cursor:'pointer',fontWeight:600,fontSize:13,fontFamily:'var(--font-sans)',transition:'all 0.18s ease',display:'inline-flex',alignItems:'center',gap:7},
    ghost:     {background:iB,color:sub,border:`1px solid ${cardB}`,borderRadius:9,padding:'11px 22px',cursor:'pointer',fontWeight:500,fontSize:13,fontFamily:'var(--font-sans)',transition:'all 0.18s ease',display:'inline-flex',alignItems:'center',gap:7},
    danger:    {background:'rgba(239,68,68,0.09)',color:'#EF4444',border:'1px solid rgba(239,68,68,0.28)',borderRadius:9,padding:'11px 22px',cursor:'pointer',fontWeight:600,fontSize:13,fontFamily:'var(--font-sans)',transition:'all 0.18s ease',display:'inline-flex',alignItems:'center',gap:7},
  }[v]);

  const inputS:React.CSSProperties = {
    background:iB, border:`1px solid ${iBo}`, borderRadius:9,
    padding:'11px 14px', color:tx, fontSize:13,
    fontFamily:'var(--font-sans)', outline:'none',
    width:'100%', boxSizing:'border-box',
    transition:'border-color 0.2s ease'
  };

  // ── Detect window.ethereum wallet ────────────────────────────────────────
  useEffect(()=>{
    if(!window.ethereum) return;
    window.ethereum.request({method:'eth_accounts'}).then((accs:string[])=>{
      if(accs[0]){
        setWallet(accs[0]);
        setChainOk(true);
        loadVaults(accs[0], true);
      }
    }).catch(()=>{});
    const handleAccounts = (accs:string[]) => {
      if(accs[0]){ setWallet(accs[0]); setChainOk(true); loadVaults(accs[0],true); }
      else{ setWallet(null); setChainOk(false); setVaults([]); setPerimeter([]); }
    };
    window.ethereum.on('accountsChanged', handleAccounts);
    return () => window.ethereum?.removeListener('accountsChanged', handleAccounts);
  },[]);

  // Restore Circle wallet session
  useEffect(()=>{
    const savedId      = localStorage.getItem('circle_wallet_id');
    const savedAddress = localStorage.getItem('circle_wallet_address');
    if(savedId && savedAddress && !wallet){
      setCircleWalletId(savedId);
      setWallet(savedAddress);
      setChainOk(true);
      setWalletType('circle');
    }
  },[]);

  useEffect(()=>{
    if(walletType==='circle' && wallet){
      // Small delay so walletType is stable in the loadVaults closure
      const t = setTimeout(()=>loadVaults(wallet, true, true), 100);
      return ()=>clearTimeout(t);
    }
  },[walletType, wallet]);
  // ── Auto-redirect once wallet confirmed ───────────────────────────────────
  useEffect(()=>{
    if(wallet && chainOk && page==='landing') setPage('dashboard');
  },[wallet, chainOk]);
  // ── Counter animation (landing only, not connected) ───────────────────────
  useEffect(()=>{
    if(wallet && chainOk && vaults.length > 0){
      const settled = vaults.filter(v=>v.status===5||v.status===6);
      setTvg(settled.reduce((s,v)=>s+Number(v.amount),0)/1e6);
      setVc(settled.length);
      return;
    }
    if(page !== 'landing') return;
    let t1=0,t2=0,af:number;
    const TVG=1900, VC=19;
    const run=()=>{
      t1=Math.min(t1+Math.ceil(TVG/55),TVG);
      t2=Math.min(t2+Math.ceil(VC/55),VC);
      setTvg(t1); setVc(t2);
      if(t1<TVG||t2<VC) af=requestAnimationFrame(run);
    };
    const to=setTimeout(()=>{af=requestAnimationFrame(run);},300);
    return()=>{clearTimeout(to);cancelAnimationFrame(af);};
  },[page,wallet,chainOk,vaults]);

  // ── Public RPC stats (no wallet needed) ──────────────────────────────────
  useEffect(()=>{
    if(wallet) return; // wallet connected handles its own stats
    const RPC_URLS = [
      'https://rpc.testnet.arc.network',
      'https://rpc.drpc.testnet.arc.network',
      'https://rpc.blockdaemon.testnet.arc.network',
      'https://rpc.quicknode.testnet.arc.network',
    ];
    const fetchPublicStats = async()=>{
      for(const rpc of RPC_URLS){
        try{
          const provider = new ethers.JsonRpcProvider(rpc);
          const factory  = new ethers.Contract(
            ethers.getAddress(FACTORY_ADDR),
            FactoryABI.abi,
            provider
          );
          const allAddrs:string[] = await factory.getAllVaults();
          const results = await Promise.allSettled(
            allAddrs.map(async(vAddr:string)=>{
              const vault = new ethers.Contract(
                ethers.getAddress(vAddr),
                VaultABI.abi,
                provider
              );
              const d = await vault.getVaultDetails();
              return {status:Number(d._status), amount:d._amount};
            })
          );
          const settled = results
            .filter(r=>r.status==='fulfilled')
            .map(r=>(r as PromiseFulfilledResult<any>).value)
            .filter((v:any)=>v.status===5||v.status===6);
          setTvg(settled.reduce((s:number,v:any)=>s+Number(v.amount),0)/1e6);
          setVc(settled.length);
          return; // success - stop trying fallbacks
        }catch(e){
          console.warn(`Public RPC failed (${rpc}), trying next...`);
        }
      }
      console.error('All public RPCs failed - showing cached stats');
    };
    fetchPublicStats();
  },[wallet]);

  // ── Wallet ────────────────────────────────────────────────────────────────
  const connectWallet = async()=>{
    if(!window.ethereum){ alert('No wallet found. Install MetaMask or Rabby.'); return; }
    try{
      const accs = await window.ethereum.request({method:'eth_requestAccounts'});
      if(!accs[0]) return;
      setWallet(accs[0]);
      await switchArc();
      loadVaults(accs[0], true);
    }catch(e:any){ if(e.code!==4001) console.error(e); }
  };

  const switchArc=async()=>{
    if(!window.ethereum) return;
    try{
      await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_CHAIN_HEX}]});
      setChainOk(true); setWrongNet(false);
      if(wallet) loadVaults(wallet,true);
    }catch(e:any){
      if(e.code===4902){
        await window.ethereum.request({method:'wallet_addEthereumChain',params:[ARC_PARAMS]});
        setChainOk(true); setWrongNet(false);
      }
    }
  };

  const circleLogin = async () => {
    if (!circleEmail) return;
    setCircleLoading(true);
    setCircleError('');
    try {
      // Create a new Circle wallet for this email
      const data = await circleAPI('create_wallet');
      // Store wallet info - in production you'd verify email first
      // For testnet we create wallet and connect immediately
      setCircleWalletId(data.walletId);
      setWallet(data.address);
      setChainOk(true);
      setWalletType('circle');
      setShowCircleLogin(false);
      setCircleStep('idle');
      setCircleEmail('');
      // Save to localStorage so it persists
      localStorage.setItem('circle_wallet_id', data.walletId);
      localStorage.setItem('circle_wallet_address', data.address);
      localStorage.setItem('circle_wallet_email', circleEmail);
      loadVaults(data.address, true, true);
      setPage('dashboard');
    } catch (e: any) {
      setCircleError(e.message || 'Failed to create wallet');
    }
    setCircleLoading(false);
  };

  const circleExecute = async (
    contractAddress: string,
    abiFunctionSignature: string,
    abiParameters: string[]
  ) => {
    if (!circleWalletId) throw new Error('No Circle wallet connected');
    const data = await circleAPI('execute', {
      walletId: circleWalletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters,
    });
    return data.txHash;
  };

  // ── Load vaults ───────────────────────────────────────────────────────────
  const loadVaults=useCallback(async(addr:string,showSpinner=false,forceCircle=false)=>{
    if(showSpinner) setVaultsLoading(true);
    try{
      const useCircle = forceCircle || walletType === 'circle' || !window.ethereum;
      const provider = useCircle
        ? new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network')
        : new ethers.BrowserProvider(window.ethereum);
      const factory=new ethers.Contract(ethers.getAddress(FACTORY_ADDR),FactoryABI.abi,provider);
      const [asClient,asSpec]=await Promise.all([
        factory.getVaultsByClient(ethers.getAddress(addr)).catch(()=>[]),
        factory.getVaultsBySpecialist(ethers.getAddress(addr)).catch(()=>[]),
      ]);
      const allAddrs:string[]=[...new Set([...asClient,...asSpec])];
      const details=(await Promise.allSettled(
        allAddrs.map(async(vAddr:string)=>{
          const vault=new ethers.Contract(ethers.getAddress(vAddr),VaultABI.abi,provider);
          const d=await vault.getVaultDetails();
          return {address:vAddr,client:d._client,specialist:d._specialist,amount:d._amount,description:d._description,status:Number(d._status),createdAt:d._createdAt,deadline:d._deadline,refundRequestedAt:d._refundRequestedAt,releaseRequestedAt:d._releaseRequestedAt} as Vault;
        })
      )).filter(r=>r.status==='fulfilled').map(r=>(r as PromiseFulfilledResult<Vault>).value);
      const sorted=details.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
      setVaults(sorted);

      try{
        const usdc=new ethers.Contract(ethers.getAddress(USDC_ADDR),['function balanceOf(address) view returns (uint256)'],provider);
        setUsdcBalance(await usdc.balanceOf(ethers.getAddress(addr)));
      }catch(_){}

      const refundSet=new Set<string>();
      await Promise.all(
        sorted.filter(v=>v.status===2||v.status===3||v.status===4).map(async(v)=>{
          try{
            const vault=new ethers.Contract(ethers.getAddress(v.address),VaultABI.abi,provider);
            const currentBlock=await provider.getBlockNumber();
            const fromBlock=Math.max(0,currentBlock-9000);
            const events=await vault.queryFilter(vault.filters.RefundRequested(null),fromBlock,'latest');
            if(events.length>0) refundSet.add(v.address.toLowerCase());
          }catch(err){console.warn('RefundRequested filter failed for',v.address,err);}
        })
      );
      setRefundRequestedVaults(prev=>{
        const merged=new Set(prev);
        refundSet.forEach(a=>merged.add(a));
        return merged;
      });

      setPerimeter(
        sorted
          .filter(v=>[4,5,6].includes(v.status))
          .map(v=>({vaultAddr:v.address,action:VS[v.status],amount:v.amount,timestamp:Number(v.createdAt),description:v.description}))
          .slice(0,10)
      );
    }catch(e){console.error('loadVaults:',e);}
    finally{setVaultsLoading(false);}
  },[walletType]);

  useEffect(()=>{
    if(!wallet||!chainOk||page==='landing'||showCreate) return;
    if(walletType !== 'circle' && !window.ethereum) return;
    const isCircle = walletType === 'circle';
    loadVaults(wallet, false, isCircle);
    const id=setInterval(()=>loadVaults(wallet, false, isCircle),5000);
    return()=>clearInterval(id);
  },[wallet,chainOk,page,loadVaults,showCreate,walletType]);

  useEffect(()=>{
    if(!selected) return;
    const updated=vaults.find(v=>v.address===selected.address);
    if(updated&&updated.status!==selected.status) setSelected(updated);
  },[vaults,selected]);

  // ── Contract helpers ──────────────────────────────────────────────────────

  const getSigner = async() => {
    if(walletType === 'circle' || !window.ethereum) {
      // Circle wallet - return a JsonRpcSigner-like object that routes through circleExecute
      // For read operations only - writes go through circleExecute directly
      const provider = new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network');
      return provider.getSigner(wallet!);
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('wallet_switchEthereumChain', [{ chainId: ARC_CHAIN_HEX }]).catch(()=>{});
    return provider.getSigner();
  };

  const getProvider = async(): Promise<ethers.BrowserProvider | ethers.JsonRpcProvider> => {
    if(walletType === 'circle' || !window.ethereum)
      return new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network');
    return new ethers.BrowserProvider(window.ethereum);
  };

  const getVC = async(a:string) => new ethers.Contract(ethers.getAddress(a),VaultABI.abi,await getSigner());

  const afterTx=async(msg:string,newStatus?:number)=>{
    setTxPending(null);
    pushNotif(msg);
    // Poll a few times to catch the state change
    if(wallet){
      loadVaults(wallet,false);
      setTimeout(()=>{if(wallet) loadVaults(wallet,false);},3000);
      setTimeout(()=>{if(wallet) loadVaults(wallet,false);},7000);
      setTimeout(()=>{if(wallet) loadVaults(wallet,false);},12000);
    }
    if(newStatus!==undefined) setSelected(s=>s?{...s,status:newStatus}:s);
  };

  const createVault=async()=>{
    const spec = createSpec.trim();
const amt  = createAmt.trim();
const desc = createDesc.trim();
    if(!spec||!amt||!desc){alert('Please fill in all fields');return;}
    if(!ethers.isAddress(spec)){alert('Invalid specialist wallet address');return;}
    if(parseFloat(amt)<=0){alert('Amount must be greater than 0');return;}
    if(selectedDays <= 0){alert('Please enter a valid deadline (at least 1 day)');return;}
    setLoading(true);
    try{
      const days = selectedDays;
      const deadlineTs = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
      let txHash: string;
      if(walletType === 'circle'){
        txHash = await circleExecute(
          ethers.getAddress(FACTORY_ADDR),
          'createVault(address,uint256,string,uint256)',
          [ethers.getAddress(spec), ethers.parseUnits(amt,6).toString(), desc, deadlineTs.toString()]
        );
        if(txHash) setTxPending({action:'Creating Vault', hash:txHash});
      } else {
        const signer = await getSigner();
        const factory = new ethers.Contract(ethers.getAddress(FACTORY_ADDR),FactoryABI.abi,signer);
        const t = await factory.createVault(ethers.getAddress(spec),ethers.parseUnits(amt,6),desc,deadlineTs,{gasLimit:500000});
        setTxPending({action:'Creating Vault',hash:t.hash});
        await t.wait();
        txHash = t.hash;
      }
      setShowCreate(false);
setCreateSpec('');
setCreateAmt('');
setCreateDesc('');
setSelectedDays(30);
setCustomMode(false);
      await afterTx('New vault created - awaiting Specialist acceptance');
    }catch(e:any){alert(`Error: ${e?.reason||e?.data?.message||e?.message||'Transaction failed'}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const acceptVault=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'acceptVault()',[]);
        if(txHash) setTxPending({action:'Accepting Vault',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.acceptVault({gasLimit:200000});
        setTxPending({action:'Accepting Vault',hash:t.hash});
        await t.wait();
      }
      await afterTx('Vault accepted - client can now fund',1);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const fundVault=async(v:Vault)=>{
    setLoading(true);
    try{
      const vAddr=ethers.getAddress(v.address);
      if(walletType==='circle'){
        // First approve USDC spend
        const approveTx=await circleExecute(
          ethers.getAddress(USDC_ADDR),
          'approve(address,uint256)',
          [vAddr, v.amount.toString()]
        );
        if(approveTx) setTxPending({action:'Approving USDC',hash:approveTx});
        // Then fund
        const fundTx=await circleExecute(vAddr,'fundVault()',[]);
        if(fundTx) setTxPending({action:'Funding Vault',hash:fundTx});
      } else {
        const signer=await getSigner();
        const usdc=new ethers.Contract(
          ethers.getAddress(USDC_ADDR),
          ['function approve(address,uint256) returns (bool)','function allowance(address,address) view returns (uint256)','function balanceOf(address) view returns (uint256)'],
          signer
        );
        const sigAddr=await signer.getAddress();
        const currentBal=await usdc.balanceOf(sigAddr);
        if(currentBal<v.amount){
          alert(`Insufficient USDC balance.\n\nYou have: $${(Number(currentBal)/1e6).toFixed(2)} USDC\nVault requires: $${(Number(v.amount)/1e6).toFixed(2)} USDC\n\nGet testnet USDC at faucet.circle.com`);
          return;
        }
        const allow=await usdc.allowance(sigAddr,vAddr);
        if(allow<v.amount){
          const a=await usdc.approve(vAddr,v.amount,{gasLimit:100000});
          setTxPending({action:'Approving USDC',hash:a.hash});
          await a.wait();
        }
        const vault=new ethers.Contract(vAddr,VaultABI.abi,signer);
        const t=await vault.fundVault({gasLimit:300000});
        setTxPending({action:'Funding Vault',hash:t.hash});
        await t.wait();
      }
      await afterTx('Vault funded - USDC locked on-chain',2);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const requestRelease=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'requestRelease()',[]);
        if(txHash) setTxPending({action:'Requesting Release',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.requestRelease({gasLimit:200000});
        setTxPending({action:'Requesting Release',hash:t.hash});
        await t.wait();
      }
      await afterTx('Release requested - awaiting client approval',3);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const releaseFunds=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'releaseFunds()',[]);
        if(txHash) setTxPending({action:'Releasing Funds',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.releaseFunds({gasLimit:200000});
        setTxPending({action:'Releasing Funds',hash:t.hash});
        await t.wait();
      }
      await afterTx('Funds released to Specialist',5);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const requestRefund=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'requestRefund()',[]);
        if(txHash) setTxPending({action:'Requesting Refund',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.requestRefund({gasLimit:200000});
        setTxPending({action:'Requesting Refund',hash:t.hash});
        await t.wait();
      }
      setRefundRequestedVaults(prev=>{const n=new Set(prev);n.add(v.address.toLowerCase());return n;});
      await afterTx('Refund requested - Specialist can now approve');
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const approveRefund=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'approveRefund()',[]);
        if(txHash) setTxPending({action:'Approving Refund',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.approveRefund({gasLimit:200000});
        setTxPending({action:'Approving Refund',hash:t.hash});
        await t.wait();
      }
      await afterTx('Refund approved - USDC returned to Client',6);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };
  const raiseDispute=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'dispute()',[]);
        if(txHash) setTxPending({action:'Raising Dispute',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.dispute({gasLimit:200000});
        setTxPending({action:'Raising Dispute',hash:t.hash});
        await t.wait();
      }
      await afterTx('Dispute raised - Admin will arbitrate',4);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  const cancelVault=async(v:Vault)=>{
    setLoading(true);
    try{
      if(walletType==='circle'){
        const txHash=await circleExecute(ethers.getAddress(v.address),'cancelVault()',[]);
        if(txHash) setTxPending({action:'Cancelling Vault',hash:txHash});
      } else {
        const vault=await getVC(v.address);
        const t=await vault.cancelVault({gasLimit:200000});
        setTxPending({action:'Cancelling Vault',hash:t.hash});
        await t.wait();
      }
      await afterTx('Vault cancelled',7);
    }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
    finally{setLoading(false);}
  };

  // ── Perimeter component ───────────────────────────────────────────────────
  const Perimeter=()=>(
    <div style={{...cardS, overflow:'hidden'}}>
      {perimeter.length===0 ? (
        <div style={{padding:'32px 24px',textAlign:'center',color:sub,fontSize:13}}>
          No settled vaults yet. Activity appears here after completions, refunds, or disputes.
        </div>
      ) : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'1.2fr 2fr 1fr 90px',gap:12,padding:'11px 22px',borderBottom:`1px solid ${cardB}`,opacity:0.45}}>
            {['Vault','Description','Status','Amount'].map(h=>(
              <div key={h} style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)'}}>{h}</div>
            ))}
          </div>
          {perimeter.map((ev,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1.2fr 2fr 1fr 90px',gap:12,padding:'13px 22px',borderBottom:i<perimeter.length-1?`1px solid ${cardB}`:'none',alignItems:'center'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:em}}>{fmt(ev.vaultAddr)}</span>
              <span style={{fontSize:12,color:sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.description}</span>
              <Badge s={ev.action}/>
              <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700}}>${fmtUsdc(ev.amount)}</span>
                <a href={exAddr(ev.vaultAddr)} target="_blank" rel="noreferrer" style={{color:sub,textDecoration:'none',display:'flex'}}>
                  <IconExternalLink size={13} color={sub}/>
                </a>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  // ── Header ────────────────────────────────────────────────────────────────
  const Hdr=(
    <>
      {mobileNav && (
        <div
          style={{position:'fixed',inset:0,zIndex:298,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}
          onClick={()=>setMobileNav(false)}
        />
      )}
      <div style={{
        position:'fixed',top:0,left:0,right:0,zIndex:300,
        background:dark?'rgba(8,8,11,0.92)':'rgba(244,245,247,0.94)',
        backdropFilter:'blur(24px)',
        borderBottom:`1px solid ${cardB}`,
        height:62
      }}>
        <div style={{
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'0 28px',height:'100%',maxWidth:1280,margin:'0 auto'
        }}>
          {/* Logo */}
          <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',flexShrink:0}}
            onClick={()=>{setPage('landing');setMobileNav(false);}}>
            <Logo size={28}/>
            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:15,color:em,letterSpacing:'0.06em'}}>ArcSentry</span>
          </div>

          {/* Desktop nav */}
          {wallet && chainOk && (
            <div style={{display:'flex',gap:2,position:'absolute',left:'50%',transform:'translateX(-50%)'}}>
              {(['landing','dashboard','history'] as const).map(p=>(
                <button key={p}
                  style={{
                    background:page===p?'rgba(0,201,122,0.09)':'transparent',
                    color:page===p?em:sub,
                    border:'none',borderRadius:7,
                    padding:'7px 16px',cursor:'pointer',
                    fontSize:13,fontWeight:page===p?600:400,
                    fontFamily:'var(--font-sans)'
                  }}
                  onClick={()=>setPage(p)}>
                  {p==='landing'?'Home':p==='dashboard'?'Dashboard':'History'}
                </button>
              ))}
            </div>
          )}

          {/* Right side */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <button
              onClick={()=>setDark(x=>!x)}
              style={{
                background:iB,border:`1px solid ${cardB}`,
                borderRadius:20,padding:'5px 12px',
                cursor:'pointer',color:sub,fontSize:12,
                fontFamily:'var(--font-sans)'
              }}>
              {dark ? 'Light' : 'Dark'}
            </button>

            {!wallet ? (
              <button style={btn('primary')} onClick={()=>setShowCircleLogin(true)}>Connect Wallet</button>
            ) : !chainOk ? (
              <button style={btn('danger')} onClick={switchArc}>Switch to Arc</button>
            ) : (
              <div style={{position:'relative'}} ref={walletMenuRef}>
  <div
    style={{
      ...cardS, padding:'5px 13px',
      display:'flex',alignItems:'center',gap:8,
      borderRadius:20, cursor:'pointer'
    }}
    onClick={()=>setShowWalletMenu(x=>!x)}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:'#00C97A',flexShrink:0,animation:'none'}}/>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:sub}}>{fmt(wallet)}</span>
                  <span style={{fontSize:10,color:em,fontWeight:700,fontFamily:'var(--font-mono)'}}>Arc</span>
                  <IconChevronDown size={11} color={sub}/>
                </div>
                {showWalletMenu && (
                  <>
                    
                    <div style={{
  position:'absolute',top:'calc(100% + 8px)',right:0,
  ...cardS, borderRadius:10, minWidth:180,
  zIndex:400, overflow:'hidden',
  animation:'fade-up 0.18s ease'
}} onClick={e=>e.stopPropagation()}>
                      <div style={{padding:'10px 14px',borderBottom:`1px solid ${cardB}`}}>
                        <div style={{fontSize:10,color:sub,marginBottom:4}}>Connected wallet</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:tx,marginBottom:6}}>{wallet}</div>
                        <button
                          style={{
                            background:'rgba(0,201,122,0.08)',
                            border:'1px solid rgba(0,201,122,0.2)',
                            borderRadius:6,padding:'4px 10px',
                            fontSize:11,color:em,cursor:'pointer',
                            fontFamily:'var(--font-mono)',width:'100%'
                          }}
                          onClick={e=>{
  e.stopPropagation();
  navigator.clipboard.writeText(wallet||'');
  alert('Wallet address copied!');
}}>
                          Copy full address
                        </button>
                      </div>
                      
                       <a href={exAddr(wallet)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display:'flex',alignItems:'center',gap:8,
                          padding:'10px 14px',fontSize:12,color:sub,
                          textDecoration:'none',borderBottom:`1px solid ${cardB}`
                        }}
                        onClick={e=>{
  e.stopPropagation();
  setShowWalletMenu(false);
}}>
                        <IconExternalLink size={12} color={sub}/>
                        View on Arcscan
                      </a>
                      <button
                        style={{
                          display:'flex',alignItems:'center',gap:8,
                          width:'100%',padding:'10px 14px',
                          background:'transparent',border:'none',
                          fontSize:12,color:'#EF4444',cursor:'pointer',
                          textAlign:'left'
                        }}
                        onClick={()=>{
                          setWallet(null);
                          setChainOk(false);
                          setVaults([]);
                          setPerimeter([]);
                          setPage('landing');
                          setShowWalletMenu(false);
                          setCircleWalletId(null);
                          setWalletType(null);
                          localStorage.removeItem('circle_wallet_id');
                          localStorage.removeItem('circle_wallet_address');
                          localStorage.removeItem('circle_wallet_email');
                        }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile hamburger */}
            {wallet && chainOk && (
              <button
                style={{background:iB,border:`1px solid ${cardB}`,borderRadius:8,padding:'7px',cursor:'pointer',color:sub,display:'none'}}
                className="mobile-menu-btn"
                onClick={()=>setMobileNav(x=>!x)}>
                <IconMenu size={18} color={sub}/>
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileNav && wallet && chainOk && (
          <div style={{
            position:'absolute',top:62,left:0,right:0,
            background:dark?'rgba(8,8,11,0.98)':'rgba(244,245,247,0.98)',
            borderBottom:`1px solid ${cardB}`,
            padding:'12px 16px',
            display:'flex',flexDirection:'column',gap:4,
            zIndex:299, animation:'fade-up 0.2s ease'
          }}>
            {(['landing','dashboard','history'] as const).map(p=>(
              <button key={p}
                style={{
                  background:page===p?'rgba(0,201,122,0.09)':'transparent',
                  color:page===p?em:sub,
                  border:'none',borderRadius:8,
                  padding:'12px 16px',cursor:'pointer',
                  fontSize:14,fontWeight:page===p?600:400,
                  fontFamily:'var(--font-sans)',textAlign:'left'
                }}
                onClick={()=>{setPage(p);setMobileNav(false);}}>
                {p==='landing'?'Home':p==='dashboard'?'Dashboard':'History'}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // ── Wrong Network Modal ───────────────────────────────────────────────────
  const WrongNet=()=>wrongNet?(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',backdropFilter:'blur(12px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{...cardS,padding:44,maxWidth:380,textAlign:'center',width:'100%'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
          <IconWarning size={24} color="#EF4444"/>
        </div>
        <h2 style={{color:'#EF4444',margin:'0 0 10px',fontWeight:800,fontSize:20}}>Wrong Network</h2>
        <p style={{color:sub,marginBottom:26,lineHeight:1.65,fontSize:14}}>Switch to Arc Testnet (Chain ID 5042002) to use ArcSentry.</p>
        <button style={{...btn('primary'),width:'100%',justifyContent:'center',padding:'13px 22px'}} onClick={switchArc}>Switch to Arc Testnet</button>
      </div>
    </div>
  ):null;

  // ── Tx Toast ──────────────────────────────────────────────────────────────
  const TxToast=()=>txPending?(
    <div style={{
      position:'fixed',bottom:24,right:24,zIndex:600,
      ...cardS,padding:'16px 20px',minWidth:300,
      borderColor:'rgba(0,201,122,0.28)',
      animation:'slide-in 0.3s ease'
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:18,height:18,border:`2px solid ${em}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.9s linear infinite',flexShrink:0}}/>
        <div>
          <div style={{fontWeight:600,fontSize:13,color:tx}}>Transaction Pending</div>
          <div style={{color:sub,fontSize:11,marginTop:2}}>{txPending.action}</div>
        </div>
        <a href={exTx(txPending.hash)} target="_blank" rel="noreferrer"
          style={{color:em,fontSize:11,marginLeft:'auto',textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
          View <IconExternalLink size={11} color={em}/>
        </a>
      </div>
    </div>
  ):null; 

  // ── LANDING ───────────────────────────────────────────────────────────────
  const Landing=()=>(
    <div style={{paddingTop:62}}>

      {/* Hero */}
      <div style={{
        minHeight:'92vh',display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',
        textAlign:'center',padding:'80px 24px 60px',
        position:'relative',overflow:'hidden'
      }}>
        <div className="grid-pattern"/>
        <div className="glow-orb" style={{top:'38%',left:'50%',transform:'translate(-50%,-50%)',width:700,height:700}}/>

        <div style={{position:'relative',zIndex:1,maxWidth:700,width:'100%'}}>
          {/* Badge */}
          <div style={{
            display:'inline-flex',alignItems:'center',gap:8,
            marginBottom:28,
            background:'rgba(0,201,122,0.08)',
            border:'1px solid rgba(0,201,122,0.22)',
            borderRadius:20,padding:'5px 15px',
            fontSize:11,color:em,fontWeight:700,
            fontFamily:'var(--font-mono)'
          }}>
            <span style={{width:6,height:6,borderRadius:'50%',background:em,boxShadow:`0 0 7px ${em}`,display:'inline-block',animation:'pulse-dot 1.8s infinite'}}/>
            Beta - Arc Testnet
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize:'clamp(40px,6.5vw,74px)',
            fontWeight:900,margin:'0 0 20px',
            lineHeight:1.05,letterSpacing:'-0.03em',
            color:tx
          }}>
            Trustless Deals.<br/>
            <span style={{color:em}}>Secured by Arc.</span>
          </h1>

          <p style={{
            maxWidth:490,color:sub,
            lineHeight:1.75,fontSize:'clamp(14px,2vw,16.5px)',
            margin:'0 auto 40px'
          }}>
            ArcSentry is a decentralized escrow protocol on Arc Network. Lock USDC in a <strong style={{color:tx,fontWeight:600}}>Vault</strong> - release only when the work ships. No middlemen. No trust required.
          </p>

          {/* CTAs */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center',marginBottom:72}}>
            {!wallet ? (
              <button style={{...btn('primary'),padding:'14px 32px',fontSize:15}} onClick={()=>setShowCircleLogin(true)}>
                Connect Wallet <IconArrowRight size={16} color="#000"/>
              </button>
            ) : chainOk ? (
              <button style={{...btn('primary'),padding:'14px 32px',fontSize:15}} onClick={()=>setPage('dashboard')}>
                Open Dashboard <IconArrowRight size={16} color="#000"/>
              </button>
            ) : (
              <button style={{...btn('danger'),padding:'14px 32px',fontSize:15}} onClick={switchArc}>
                Switch to Arc Testnet
              </button>
            )}
            <button
              style={{...btn('secondary'),padding:'14px 32px',fontSize:15}}
              onClick={()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'})}>
              How it works
            </button>
          </div>

          {/* Stats */}
          <div style={{display:'flex',gap:0,flexWrap:'wrap',justifyContent:'center',borderTop:`1px solid ${cardB}`,borderBottom:`1px solid ${cardB}`,paddingTop:32,paddingBottom:32}}>
            {[
              {label:'Testnet Value Guarded',val:`$${tvg.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`},
              {label:'Vaults Settled',val:vc.toLocaleString()},
              {label:'Avg. Settlement',val:'< 1s'},
            ].map((s,i)=>(
              <div key={s.label} style={{textAlign:'center',flex:1,minWidth:140,padding:'0 24px',borderRight:i<2?`1px solid ${cardB}`:'none'}}>
                <div style={{fontSize:'clamp(26px,4vw,38px)',fontWeight:800,color:em,fontFamily:'var(--font-mono)'}}>{s.val}</div>
                <div style={{fontSize:12,color:sub,marginTop:5}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" style={{padding:'88px 24px',maxWidth:960,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:52}}>
          <div className="section-label" style={{textAlign:'center'}}>Protocol</div>
          <h2 style={{fontSize:'clamp(26px,4vw,36px)',fontWeight:800,margin:'0 0 12px',color:tx}}>How a Vault Works</h2>
          <p style={{color:sub,fontSize:15,maxWidth:460,margin:'0 auto'}}>Three steps. Total clarity. No surprises.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:20}}>
          {[
            {
              n:'01',color:'#60A5FA',borderClr:'rgba(96,165,250,0.15)',
              icon:<IconVault size={22} color="#60A5FA"/>,
              title:'Initiate',
              desc:'Create a Vault with the Specialist\'s wallet address, USDC amount, and a clear deliverable description. The Specialist must accept before funds move.'
            },
            {
              n:'02',color:em,borderClr:'rgba(0,201,122,0.18)',
              icon:<IconLock size={22} color={em}/>,
              title:'Lock',
              desc:'Specialist accepts the terms. Client funds the vault. USDC moves into the smart contract and is locked - no one can touch it until settlement.'
            },
            {
              n:'03',color:'#F59E0B',borderClr:'rgba(245,158,11,0.15)',
              icon:<IconScale size={22} color="#F59E0B"/>,
              title:'Settlement',
              desc:'Work delivered - release funds to the Specialist. Not satisfied - request a refund, which the Specialist approves. Unresolved - escalate to admin arbitration.'
            },
          ].map(s=>(
            <div key={s.n} style={{
              background:surfaceCard,
              border:`1px solid ${s.borderClr}`,
              borderRadius:18,padding:'28px 26px',
              position:'relative',overflow:'hidden',
              transition:'transform 0.2s ease, border-color 0.2s ease'
            }}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.transform='translateY(-3px)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform='none';}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:52,fontWeight:900,position:'absolute',top:10,right:16,opacity:0.05,color:s.color,lineHeight:1}}>{s.n}</div>
              <div style={{width:44,height:44,borderRadius:11,background:`${s.color}14`,border:`1px solid ${s.color}22`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:18}}>
                {s.icon}
              </div>
              <h3 style={{margin:'0 0 11px',color:s.color,fontWeight:700,fontSize:17}}>{s.title}</h3>
              <p style={{color:sub,lineHeight:1.7,margin:0,fontSize:13.5}}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Security / Trust section */}
      <div style={{background:surfaceCard,borderTop:`1px solid ${cardB}`,borderBottom:`1px solid ${cardB}`,padding:'88px 24px'}}>
        <div style={{maxWidth:960,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:60,alignItems:'center'}}>
          <div>
            <div className="section-label">Security</div>
            <h2 style={{fontSize:'clamp(24px,4vw,34px)',fontWeight:800,margin:'0 0 16px',lineHeight:1.15,color:tx}}>
              Built for deals that<br/><span style={{color:em}}>actually matter</span>
            </h2>
            <p style={{color:sub,fontSize:14,lineHeight:1.75,marginBottom:32,maxWidth:420}}>
              Every vault is a standalone smart contract on Arc Network. Funds are held by code, not by us. Nobody - including ArcSentry - can touch locked USDC without the agreed conditions being met.
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:18}}>
              {[
                {icon:<IconShield size={16} color={em}/>, title:'Non-custodial by design', desc:'ArcSentry never holds your funds. Every USDC is locked in your vault contract only.'},
                {icon:<IconZap size={16} color={em}/>, title:'Instant settlement', desc:'Release or refund executes on-chain in under a second. No waiting, no banking delays.'},
                {icon:<IconScale size={16} color={em}/>, title:'Dispute arbitration', desc:'Stuck deals can be escalated to an admin arbitrator. Funds stay frozen until resolution.'},
              ].map(item=>(
                <div key={item.title} style={{display:'flex',alignItems:'flex-start',gap:13}}>
                  <div style={{
                    width:34,height:34,borderRadius:9,
                    background:'rgba(0,201,122,0.09)',
                    border:'1px solid rgba(0,201,122,0.18)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    flexShrink:0
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{fontSize:13.5,fontWeight:700,color:tx,marginBottom:3}}>{item.title}</div>
                    <div style={{fontSize:12.5,color:sub,lineHeight:1.6}}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live vault cards */}
          <div style={{display:'flex',flexDirection:'column',gap:13}}>
            <div style={{fontSize:11,color:sub,fontFamily:'var(--font-mono)',marginBottom:2,display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:em,animation:'pulse-dot 1.8s infinite',display:'inline-block'}}/>
              Live vault activity
            </div>
            {[
              {addr:'0xcc97...C898',status:'Completed',amount:'$170.00',desc:'Content writing'},
              {addr:'0xe7Fc...E41a',status:'Completed',amount:'$250.00',desc:'Volume deal'},
              {addr:'0xab2f...1294',status:'Disputed',amount:'$20.00',desc:'Pending arbitration'},
            ].map(v=>(
              <div key={v.addr} style={{
                background:surfaceRaise,
                border:`1px solid ${cardB}`,
                borderRadius:13,padding:'16px 18px',
                transition:'border-color 0.2s ease'
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:em}}>{v.addr}</span>
                  <Badge s={v.status}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                  <span style={{fontSize:12,color:sub}}>{v.desc}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:17,fontWeight:800,color:tx}}>{v.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Arc Network callout */}
      <div style={{padding:'60px 24px',maxWidth:760,margin:'0 auto',textAlign:'center'}}>
        <div className="section-label" style={{textAlign:'center'}}>Infrastructure</div>
        <h3 style={{fontSize:22,fontWeight:700,margin:'0 0 12px',color:tx}}>Built on Arc Network</h3>
        <p style={{color:sub,fontSize:14,lineHeight:1.75,maxWidth:520,margin:'0 auto 20px'}}>
          Arc Network is an EVM-compatible Layer 1 blockchain built by Circle, where USDC is the native gas token. Every ArcSentry transaction - vault creation, funding, release, refund - costs fractions of a cent, paid in USDC.
        </p>
        <a href="https://arc.network" target="_blank" rel="noreferrer"
          style={{display:'inline-flex',alignItems:'center',gap:6,color:em,fontSize:13,fontWeight:600,textDecoration:'none'}}>
          Learn about Arc Network <IconExternalLink size={13} color={em}/>
        </a>
      </div>

      {/* Perimeter */}
      {perimeter.length > 0 && (
        <div style={{padding:'0 24px 80px',maxWidth:960,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <div className="section-label" style={{margin:0}}>Public Ledger</div>
            <h3 style={{fontWeight:700,fontSize:18,color:tx}}>The Perimeter</h3>
            <span style={{fontSize:10,color:em,fontFamily:'var(--font-mono)',background:'rgba(0,201,122,0.09)',padding:'2px 8px',borderRadius:5,border:'1px solid rgba(0,201,122,0.2)'}}>LIVE</span>
          </div>
          <p style={{color:sub,fontSize:13,marginBottom:18}}>Every settled vault on Arc testnet, visible to all.</p>
          <Perimeter/>
        </div>
      )}

      {/* FAQ */}
      <div style={{background:surfaceCard,borderTop:`1px solid ${cardB}`,padding:'88px 24px'}}>
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:52}}>
            <div className="section-label" style={{textAlign:'center'}}>FAQ</div>
            <h2 style={{fontSize:'clamp(24px,4vw,32px)',fontWeight:800,margin:'0 0 10px',color:tx}}>Common questions</h2>
            <p style={{color:sub,fontSize:14}}>Everything you need to know before locking your first deal.</p>
          </div>
          {[
            {
              q:'What happens if the Specialist does not deliver?',
              a:'You can request a refund at any point while the vault is funded. The Specialist must approve it, or you can escalate to a dispute for admin arbitration. Funds stay locked in the contract until resolution - they cannot be moved without an agreed action.'
            },
            {
              q:'Does ArcSentry charge fees?',
              a:'No platform fees during testnet. Gas costs are paid in USDC on Arc Network and are minimal - typically under $0.01 per transaction. Fee structure for mainnet will be published before launch.'
            },
            {
              q:'Who controls the funds in a vault?',
              a:'Nobody. The vault is a standalone smart contract - an autonomous piece of code. ArcSentry cannot move or access your USDC. Only the agreed settlement actions (release, refund, or admin resolution during a dispute) can move funds.'
            },
            {
              q:'What is Arc Network?',
              a:'Arc Network is an EVM-compatible Layer 1 blockchain built by Circle, where USDC is the native gas token. This means all transactions are paid in USDC directly, with no separate gas token needed.'
            },
            {
              q:'How does dispute resolution work?',
              a:'Either party can raise a dispute on a funded vault. Funds are frozen in the contract while an admin arbitrator reviews the case. The arbitrator can release funds to the Specialist or refund the Client based on the evidence. Both parties can also resolve consensually at any point during a dispute.'
            },
            {
              q:'Is the smart contract audited?',
              a:'ArcSentry is currently on testnet. The contracts are unaudited - do not use with real funds. A full audit will be completed before any mainnet deployment.'
            },
          ].map(item=>(
            <FaqItem key={item.q} q={item.q} a={item.a}/>
          ))}
        </div>
      </div>

      {/* Footer */}
      <Footer/>
    </div>
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  const Footer=()=>(
    <footer style={{
      borderTop:`1px solid ${cardB}`,
      padding:'36px 24px',
      background:dark?'rgba(8,8,11,0.98)':'rgba(244,245,247,0.98)'
    }}>
      <div style={{maxWidth:960,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:24,justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <Logo size={22}/>
            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:13,color:em}}>ArcSentry</span>
          </div>
          <span style={{fontSize:12,color:sub}}>Decentralized escrow on Arc Network</span>
          <a href={`https://testnet.arcscan.app/address/${FACTORY_ADDR}`} target="_blank" rel="noreferrer"
            style={{fontSize:11,color:'#444',fontFamily:'var(--font-mono)',textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
            Factory: {FACTORY_ADDR ? `${FACTORY_ADDR.slice(0,10)}...` : '0x...'} <IconExternalLink size={10} color="#444"/>
          </a>
        </div>
        <div style={{display:'flex',gap:32,flexWrap:'wrap'}}>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)'}}>Protocol</div>
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>Arcscan Explorer <IconExternalLink size={11} color={sub}/></a>
            <a href="https://arc.network" target="_blank" rel="noreferrer" style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>Arc Network <IconExternalLink size={11} color={sub}/></a>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>USDC Faucet <IconExternalLink size={11} color={sub}/></a>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)'}}>Resources</div>
            <a href="/docs" style={{fontSize:12,color:sub,textDecoration:'none'}}>Docs</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>GitHub <IconExternalLink size={11} color={sub}/></a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>Twitter / X <IconExternalLink size={11} color={sub}/></a>
          </div>
        </div>
        <div style={{fontSize:11,color:'#444',maxWidth:260,lineHeight:1.6}}>
          Unaudited testnet contract. Do not use with real funds. ArcSentry is a protocol, not a financial service.
        </div>
      </div>
    </footer>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const Dashboard=()=>{
    const active=vaults.filter(v=>v.status<5&&v.status!==7);
    return(
      <div style={{paddingTop:62,minHeight:'100vh',background:bg}}>
        <div style={{padding:'40px 24px 60px',maxWidth:1180,margin:'0 auto'}}>

          {/* Header row */}
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32,flexWrap:'wrap',gap:14}}>
            <div>
              <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 5px',color:tx}}>Active Vaults</h1>
              <p style={{color:sub,margin:0,fontSize:13.5}}>Live deals only - see History for completed and cancelled vaults</p>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {vaultsLoading && <span style={{color:sub,fontSize:12,fontFamily:'var(--font-mono)'}}>Syncing...</span>}
              <button style={btn('ghost')} onClick={()=>wallet&&loadVaults(wallet,true)}>
                <IconRefresh size={14} color={sub}/> Refresh
              </button>
              <Tip text="Create a new escrow deal as Client">
                <button style={btn('primary')} onClick={()=>setShowCreate(true)}>
                  <IconPlus size={14} color="#000"/> New Vault
                </button>
              </Tip>
            </div>
          </div>

          {/* Vault grid or empty state */}
          {active.length===0 ? (
            <div style={{...cardS,padding:'64px 24px',textAlign:'center',marginBottom:40}}>
              <div style={{width:68,height:68,borderRadius:'50%',background:'rgba(0,201,122,0.07)',border:'1px solid rgba(0,201,122,0.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
                <IconBuildingBlocks size={30} color={em}/>
              </div>
              <p style={{color:sub,fontSize:15,margin:'0 0 20px',fontWeight:500}}>
                {vaultsLoading ? 'Loading your vaults...' : 'No active vaults. Create one or check History for past deals.'}
              </p>
              {!vaultsLoading && (
                <button style={btn('primary')} onClick={()=>setShowCreate(true)}>
                  <IconPlus size={14} color="#000"/> Create First Vault
                </button>
              )}
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:18,marginBottom:48}}>
              {active.map(v=>{
                const isClient=wallet?.toLowerCase()===v.client.toLowerCase();
                return(
                  <div key={v.address}
                    style={{...cardS,padding:24,cursor:'pointer',transition:'all 0.22s ease'}}
                    onMouseEnter={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor='rgba(0,201,122,0.25)';el.style.transform='translateY(-2px)';}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor=cardB;el.style.transform='none';}}
                    onClick={()=>{setSelected(v);setPage('detail');}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:em,fontWeight:700}}>{fmt(v.address)}</span>
                      <Badge s={VS[v.status]}/>
                    </div>
                    <p style={{fontSize:13.5,color:tx,margin:'0 0 10px',lineHeight:1.6,fontWeight:500}}>{v.description}</p>
                    {v.deadline && v.deadline > 0n && (
                      <div style={{marginBottom:14}}>
                        {(v.status===3||v.status===4) ? (
                          <div style={{
                            display:'inline-flex',alignItems:'center',gap:5,
                            background:'rgba(107,114,128,0.1)',
                            border:'1px solid rgba(107,114,128,0.2)',
                            borderRadius:6,padding:'3px 9px',
                            fontSize:10,fontWeight:600,color:'#6B7280',
                            fontFamily:'var(--font-mono)'
                          }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Expiry paused - {v.status===4?'dispute active':'release pending'}
                          </div>
                        ) : (
                          <DeadlineCountdown deadline={v.deadline} sub={sub} em={em}/>
                        )}
                      </div>
                    )}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                      <div>
                        <div style={{fontSize:11,color:sub,marginBottom:3}}>Amount</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:20,fontWeight:800,color:tx}}>${fmtUsdc(v.amount)} <span style={{fontSize:11,color:sub,fontWeight:400}}>USDC</span></div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{
                          display:'inline-flex',alignItems:'center',gap:5,
                          background:isClient?'rgba(96,165,250,0.09)':'rgba(0,201,122,0.09)',
                          border:`1px solid ${isClient?'rgba(96,165,250,0.2)':'rgba(0,201,122,0.2)'}`,
                          borderRadius:20,padding:'3px 10px',
                          fontSize:10,fontWeight:700,
                          color:isClient?'#60A5FA':em,
                          fontFamily:'var(--font-mono)'
                        }}>
                          {isClient?<IconUser size={10} color="#60A5FA"/>:<IconTool size={10} color={em}/>}
                          {isClient?'Client':'Specialist'}
                        </div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:sub,marginTop:5}}>
                          {isClient?`Spec: ${fmt(v.specialist)}`:`Client: ${fmt(v.client)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Public Ledger */}
          {perimeter.length > 0 && (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
                <h2 style={{fontSize:18,fontWeight:700,color:tx,margin:0}}>The Perimeter</h2>
                <span style={{fontSize:10,color:em,fontFamily:'var(--font-mono)',background:'rgba(0,201,122,0.09)',padding:'2px 8px',borderRadius:5,border:'1px solid rgba(0,201,122,0.2)'}}>LIVE</span>
                <span style={{fontSize:12,color:sub}}>Public Ledger</span>
              </div>
              <Perimeter/>
            </div>
          )}
        </div>
        <Footer/>
      </div>
    );
  };

  const ExpiredClaim=({v}:{v:Vault})=>{
    const [expired,setExpired] = useState(false);
    useEffect(()=>{
      const check=async()=>{
        try{
          const provider = walletType === 'circle'
            ? new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network')
            : new ethers.BrowserProvider(window.ethereum);
          const vault=new ethers.Contract(ethers.getAddress(v.address),VaultABI.abi,provider);
          setExpired(await vault.isExpired());
        }catch(_){}
      };
      check();
    },[v.address]);
    if(!expired) return null;
    return(
      <Tip text="Deadline has passed - reclaim your USDC without needing approval.">
        <button style={btn('danger')} disabled={loading} onClick={async()=>{
          setLoading(true);
          try{
            const vault=await getVC(v.address);
            const gas=await getGasParams(await getProvider());
            const t=await vault.claimExpiredVault({gasLimit:200000,...gas});
            setTxPending({action:'Claiming Expired Vault',hash:t.hash});
            await t.wait();
            await afterTx('Expired vault claimed - USDC returned to you',6);
          }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
          finally{setLoading(false);}
        }}>
          <IconWarning size={13} color="#EF4444"/> Claim Expired Vault
        </button>
      </Tip>
    );
  };

  const TimeoutClaim=({v}:{v:Vault})=>{
    const [timedOut,setTimedOut] = useState(false);
    useEffect(()=>{
      const check=async()=>{
        try{
          const provider = walletType === 'circle'
            ? new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network')
            : new ethers.BrowserProvider(window.ethereum);
          const vault=new ethers.Contract(ethers.getAddress(v.address),VaultABI.abi,provider);
          setTimedOut(await vault.refundTimeoutElapsed());
        }catch(_){}
      };
      check();
    },[v.address]);
    if(!timedOut) return null;
    return(
      <Tip text="Specialist has not responded to your refund request in 3 days - claim automatically.">
        <button style={btn('ghost')} disabled={loading} onClick={async()=>{
          setLoading(true);
          try{
            const vault=await getVC(v.address);
            const gas=await getGasParams(await getProvider());
            const t=await vault.claimTimeoutRefund({gasLimit:200000,...gas});
            setTxPending({action:'Claiming Timeout Refund',hash:t.hash});
            await t.wait();
            await afterTx('Timeout refund claimed - USDC returned to you',6);
          }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
          finally{setLoading(false);}
        }}>
          Claim Timeout Refund
        </button>
      </Tip>
    );
  };
  const TimeoutRelease=({v}:{v:Vault})=>{
  const [timedOut,setTimedOut] = useState(false);
  useEffect(()=>{
    const check=async()=>{
      try{
        const provider = walletType === 'circle'
          ? new ethers.JsonRpcProvider('https://rpc.drpc.testnet.arc.network')
          : new ethers.BrowserProvider(window.ethereum);
        const vault=new ethers.Contract(ethers.getAddress(v.address),VaultABI.abi,provider);
        // releaseTimeoutElapsed must exist on your contract - same pattern as refundTimeoutElapsed
        setTimedOut(await vault.releaseTimeoutElapsed());
      }catch(_){}
    };
    check();
  },[v.address]);
  if(!timedOut) return null;
  return(
    <Tip text="Specialist requested release but client has not responded in 3 days - funds auto-release.">
      <button style={btn('primary')} disabled={loading} onClick={async()=>{
        setLoading(true);
        try{
          const vault=await getVC(v.address);
          const gas=await getGasParams(await getProvider());
          const t=await vault.claimTimeoutRelease({gasLimit:200000,...gas});
          setTxPending({action:'Claiming Timeout Release',hash:t.hash});
          await t.wait();
          await afterTx('Timeout release claimed - USDC sent to Specialist',5);
        }catch(e:any){alert(`Error: ${e.reason||e.message}`);setTxPending(null);}
        finally{setLoading(false);}
      }}>
        <IconCheck size={13} color="#000"/> Claim Timeout Release
      </button>
    </Tip>
  );
};
  // ── DETAIL ────────────────────────────────────────────────────────────────
  const Detail=()=>{
    const v=selected; if(!v) return null;
    const isClient     = wallet?.toLowerCase()===v.client.toLowerCase();
    const isSpecialist = wallet?.toLowerCase()===v.specialist.toLowerCase();
    const hasRefund    = refundRequestedVaults.has(v.address.toLowerCase());
    const statusName   = VS[v.status];

    const steps=[
      {l:'Vault Created',     sub:'Contract deployed on Arc Network',          ok:true},
      {l:'Specialist Accepted',sub:'Specialist committed to the deliverable',  ok:v.status>=1},
      {l:'Client Funded',     sub:'USDC locked in vault contract',             ok:v.status>=2},
      {l:'Release Requested', sub:'Specialist requested payment',               ok:v.status===3||v.status===5},
      {l:'Settlement',        sub:'Deal closed - funds distributed',            ok:v.status===5||v.status===6},
    ];

    const nextAction=()=>{
      if(v.status===0){
        if(isSpecialist) return 'Waiting for you to accept or cancel the vault';
        return 'Waiting for the Specialist to accept';
      }
      if(v.status===1){
        if(isClient) return 'Waiting for you to fund the vault';
        return 'Waiting for the Client to fund';
      }
      if(v.status===2){
        if(isSpecialist) return 'Deliver the work, then request release';
        return 'Waiting for the Specialist to complete the work';
      }
      if(v.status===3){
        if(isClient) return 'Review the work and release funds or request a refund';
        return 'Waiting for the Client to approve the release';
      }
      if(v.status===4) return 'Dispute active - Admin is reviewing the case. You can still resolve consensually below.';
      return null;
    };

    const hint=nextAction();

    return(
      <div style={{paddingTop:62,minHeight:'100vh',background:bg}}>
        <div style={{padding:'40px 24px 60px',maxWidth:780,margin:'0 auto'}}>

          {/* Back nav */}
          <div style={{display:'flex',gap:10,marginBottom:24,alignItems:'center'}}>
            <button style={btn('ghost')} onClick={()=>setPage('dashboard')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Dashboard
            </button>
            <button style={{...btn('ghost'),padding:'8px 14px',fontSize:12}} onClick={()=>wallet&&loadVaults(wallet,true)}>
              <IconRefresh size={13} color={sub}/> Refresh
            </button>
          </div>

          {/* Vault header */}
          <div style={{...cardS,padding:28,marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:14,fontWeight:700,color:tx}}>{fmt(v.address)}</span>
                  <Badge s={statusName}/>
                </div>
                <p style={{color:sub,margin:'0 0 10px',fontSize:14,lineHeight:1.6,maxWidth:360}}>{v.description}</p>
                {v.deadline && v.deadline > 0n && (
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    {(v.status===3||v.status===4) ? (
                      <div style={{
                        display:'inline-flex',alignItems:'center',gap:5,
                        background:'rgba(107,114,128,0.1)',
                        border:'1px solid rgba(107,114,128,0.2)',
                        borderRadius:6,padding:'3px 9px',
                        fontSize:10,fontWeight:600,color:'#6B7280',
                        fontFamily:'var(--font-mono)'
                      }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        Expiry paused - {v.status===4?'dispute active':'release pending'}
                      </div>
                    ) : (
                      <DeadlineCountdown deadline={v.deadline} sub={sub} em={em}/>
                    )}
                    <span style={{fontSize:11,color:sub}}>({fmtDeadlineDate(v.deadline)})</span>
                  </div>
                )}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11,color:sub,marginBottom:4}}>Vault Amount</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:900,color:em,lineHeight:1}}>${fmtUsdc(v.amount)}</div>
                <div style={{fontSize:11,color:sub,marginTop:4}}>USDC</div>
              </div>
            </div>
          </div>

          {/* Parties */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
            {[
              {role:'Client',sub:'Buyer / Deal initiator',addr:v.client,isYou:isClient,icon:<IconUser size={18} color="#60A5FA"/>,color:'#60A5FA'},
              {role:'Specialist',sub:'Seller / Work provider',addr:v.specialist,isYou:isSpecialist,icon:<IconTool size={18} color={em}/>,color:em},
            ].map(p=>(
              <div key={p.role} style={{...cardS,padding:20}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:9,background:`${p.color}12`,border:`1px solid ${p.color}22`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {p.icon}
                  </div>
                  {p.isYou && <span style={{fontSize:10,fontWeight:700,color:p.color,background:`${p.color}12`,border:`1px solid ${p.color}22`,borderRadius:20,padding:'2px 9px',fontFamily:'var(--font-mono)'}}>You</span>}
                </div>
                <div style={{fontSize:12,fontWeight:700,color:tx,marginBottom:2}}>{p.role}</div>
                <div style={{fontSize:11,color:sub,marginBottom:8}}>{p.sub}</div>
                <a href={exAddr(p.addr)} target="_blank" rel="noreferrer"
                  style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:p.color,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                  {fmt(p.addr)} <IconExternalLink size={11} color={p.color}/>
                </a>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{...cardS,padding:26,marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <h3 style={{margin:0,fontWeight:700,fontSize:15,color:tx}}>The Handshake - Timeline</h3>
              {v.deadline && v.deadline > 0n && (
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:sub,marginBottom:3}}>Vault deadline</div>
                  <DeadlineCountdown deadline={v.deadline} sub={sub} em={em}/>
                </div>
              )}
            </div>
            <div style={{position:'relative'}}>
              <div style={{position:'absolute',left:11,top:0,bottom:0,width:2,background:`linear-gradient(${em}55, ${cardB})`}}/>
              {steps.map((s,i)=>(
                <div key={i} style={{display:'flex',gap:18,marginBottom:i<steps.length-1?22:0,position:'relative'}}>
                  <div style={{
                    width:24,height:24,borderRadius:'50%',flexShrink:0,
                    background:s.ok?em:iB,
                    border:`2px solid ${s.ok?em:cardB}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    boxShadow:s.ok?`0 0 12px ${em}44`:'none',
                    zIndex:1
                  }}>
                    {s.ok && <IconCheck size={12} color="#000"/>}
                  </div>
                  <div style={{paddingTop:2}}>
                    <div style={{fontWeight:600,fontSize:13.5,color:s.ok?tx:sub}}>{s.l}</div>
                    <div style={{fontSize:11.5,color:sub,marginTop:2}}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            {hint && (
              <div style={{
                marginTop:20,padding:'11px 14px',
                background:'rgba(0,201,122,0.05)',
                border:'1px solid rgba(0,201,122,0.15)',
                borderRadius:9,fontSize:12.5,color:sub,lineHeight:1.6,
                display:'flex',alignItems:'flex-start',gap:8
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={em} strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {hint}
              </div>
            )}
            {/* Timeout countdown - latest action wins */}
            {(()=>{
              const showRefund = hasRefund && (v.status===2||v.status===3);
              const showRelease = v.status===3;
              if(!showRefund && !showRelease) return null;
              if(showRefund && showRelease){
                // both active - show whichever was requested more recently
                const refundTs = v.refundRequestedAt && v.refundRequestedAt > 0n ? Number(v.refundRequestedAt) : 0;
                const releaseTs = v.releaseRequestedAt && v.releaseRequestedAt > 0n ? Number(v.releaseRequestedAt) : 0;
                // if refund was requested and has a real timestamp, it always wins over a zero release
                // if both have real timestamps, latest wins
                if(refundTs > 0 && releaseTs === 0){
                  return <TimeoutCountdown requestedAt={v.refundRequestedAt} type="refund" isSpecialist={isSpecialist}/>;
                }
                if(releaseTs > 0 && refundTs === 0){
                  return <TimeoutCountdown requestedAt={v.releaseRequestedAt} type="release" isSpecialist={isSpecialist}/>;
                }
                if(refundTs >= releaseTs){
                  return <TimeoutCountdown requestedAt={v.refundRequestedAt} type="refund" isSpecialist={isSpecialist}/>;
                } else {
                  return <TimeoutCountdown requestedAt={v.releaseRequestedAt} type="release" isSpecialist={isSpecialist}/>;
                }
              }
              if(showRefund) return <TimeoutCountdown requestedAt={v.refundRequestedAt} type="refund" isSpecialist={isSpecialist}/>;
              return <TimeoutCountdown requestedAt={v.releaseRequestedAt} type="release" isSpecialist={isSpecialist}/>;
            })()}
</div>

          {/* Dispute explanation */}
          {v.status===4 && (
            <div style={{
              ...cardS,padding:22,marginBottom:20,
              borderColor:'rgba(239,68,68,0.22)'
            }}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <IconWarning size={18} color="#EF4444"/>
                <h3 style={{margin:0,fontWeight:700,fontSize:15,color:'#EF4444'}}>Dispute Active</h3>
              </div>
              <p style={{fontSize:13,color:sub,lineHeight:1.7,margin:'0 0 14px'}}>
                This vault is under admin review. Funds are frozen in the contract until a resolution is reached. The arbitrator will review the deal terms and evidence before deciding.
              </p>
              <p style={{fontSize:13,color:sub,lineHeight:1.7,margin:0}}>
                You can still resolve this between yourselves using the actions below - consensual resolution is always faster than arbitration.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{...cardS,padding:26}}>
            <h3 style={{margin:'0 0 18px',fontWeight:700,fontSize:15,color:tx}}>Actions</h3>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>

              {/* Draft */}
              {v.status===0&&isSpecialist&&<Tip text="Accept and commit to delivering the work."><button style={btn('primary')} disabled={loading} onClick={()=>acceptVault(v)}><IconCheck size={13} color="#000"/>Accept Vault</button></Tip>}
              {v.status===0&&(isClient||isSpecialist)&&<Tip text="Cancel - no USDC at risk yet."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>}

              {/* Accepted */}
              {v.status===1&&isClient&&(
                <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%'}}>
                  <div style={{
                    ...cardS,padding:'11px 16px',
                    borderColor:'rgba(0,201,122,0.18)',
                    display:'flex',alignItems:'center',justifyContent:'space-between'
                  }}>
                    <span style={{fontSize:12,color:sub}}>Your USDC Balance</span>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:usdcBalance>=v.amount?em:'#EF4444'}}>
                      ${(Number(usdcBalance)/1e6).toFixed(2)}
                      {usdcBalance<v.amount&&<span style={{fontSize:11,color:'#EF4444',marginLeft:8}}>Insufficient</span>}
                    </span>
                  </div>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <Tip text={usdcBalance>=v.amount?"Fund the vault - USDC moves to contract and is locked.":"Insufficient balance - get testnet USDC at faucet.circle.com"}>
                      <button style={{...btn('primary'),opacity:usdcBalance<v.amount?0.5:1}} disabled={loading} onClick={()=>fundVault(v)}><IconLock size={13} color="#000"/>Fund Vault</button>
                    </Tip>
                    <Tip text="Cancel - no USDC at risk yet."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>
                  </div>
                </div>
              )}
              {v.status===1&&isSpecialist&&<Tip text="Cancel - no USDC at risk yet."><button style={btn('danger')} disabled={loading} onClick={()=>cancelVault(v)}>Cancel Vault</button></Tip>}

              {/* Funded */}
              {v.status===2&&isSpecialist&&<Tip text="Work done - request payment from client."><button style={btn('primary')} disabled={loading} onClick={()=>requestRelease(v)}><IconArrowRight size={13} color="#000"/>Request Release</button></Tip>}
              {v.status===2&&isSpecialist&&hasRefund&&<Tip text="Client requested a refund - approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button></Tip>}
              {v.status===2&&isClient&&<Tip text="Signal a refund - Specialist must approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button></Tip>}
              {v.status===2&&(isClient||isSpecialist)&&<Tip text="Escalate to Admin - funds frozen pending arbitration."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}><IconWarning size={13} color="#EF4444"/>Raise Dispute</button></Tip>}

              {/* Release Requested */}
              {v.status===3&&isClient&&<Tip text="Approve - USDC sent to Specialist. Irreversible."><button style={btn('primary')} disabled={loading} onClick={()=>releaseFunds(v)}><IconCheck size={13} color="#000"/>Release Funds</button></Tip>}
              {v.status===3&&isClient&&<Tip text="Signal a refund - Specialist must approve."><button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button></Tip>}
              {v.status===3&&isClient&&<Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}><IconWarning size={13} color="#EF4444"/>Raise Dispute</button></Tip>}
              {v.status===3&&isSpecialist&&hasRefund&&(
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  <Tip text="Client requested refund - approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button></Tip>
                  <Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}><IconWarning size={13} color="#EF4444"/>Raise Dispute</button></Tip>
                </div>
              )}
              {v.status===3&&isSpecialist&&!hasRefund&&(
                <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                  <span style={{color:sub,fontSize:13,display:'flex',alignItems:'center',gap:6,padding:'10px 0'}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Awaiting client decision
                  </span>
                  <Tip text="Escalate to Admin."><button style={btn('danger')} disabled={loading} onClick={()=>raiseDispute(v)}><IconWarning size={13} color="#EF4444"/>Raise Dispute</button></Tip>
                </div>
              )}

              {/* Disputed */}
              {v.status===4&&isClient&&(
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  <Tip text="Mutually agreed - release funds to Specialist."><button style={btn('primary')} disabled={loading} onClick={()=>releaseFunds(v)}><IconCheck size={13} color="#000"/>Release Funds</button></Tip>
                  <Tip text="Signal refund - Specialist must approve."><button style={btn('ghost')} disabled={loading} onClick={()=>requestRefund(v)}>Request Refund</button></Tip>
                </div>
              )}
              {v.status===4&&isSpecialist&&(
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  <Tip text="Mutually agreed - request release so client can approve."><button style={btn('primary')} disabled={loading} onClick={()=>requestRelease(v)}><IconArrowRight size={13} color="#000"/>Request Release</button></Tip>
                  {hasRefund&&<Tip text="Client requested refund - approve to return USDC."><button style={btn('ghost')} disabled={loading} onClick={()=>approveRefund(v)}>Approve Refund</button></Tip>}
                </div>
              )}

              {/* Terminal */}
              {v.status===5&&<div style={{display:'flex',alignItems:'center',gap:8,color:em,fontWeight:700,fontSize:14}}><IconCheck size={16} color={em}/>Completed - USDC released to Specialist</div>}
              {v.status===6&&<div style={{display:'flex',alignItems:'center',gap:8,color:'#F59E0B',fontWeight:700,fontSize:14}}><IconArrowRight size={16} color="#F59E0B"/>Refunded - USDC returned to Client</div>}
              {/* v2: Expired vault claim */}
              {(v.status===2||v.status===3)&&isClient&&(
                <ExpiredClaim v={v}/>
              )}
              {/* v2: Timeout refund claim */}
{(v.status===2||v.status===3)&&isClient&&refundRequestedVaults.has(v.address.toLowerCase())&&(
  <TimeoutClaim v={v}/>
)}
{/* v2: Timeout release claim */}
{v.status===3&&isSpecialist&&(
  <TimeoutRelease v={v}/>
)}
              {v.status===7&&<div style={{color:sub,fontSize:14}}>Vault cancelled before funding. No funds were at risk.</div>}
            </div>

            {/* Contract address */}
            <div style={{marginTop:22,paddingTop:20,borderTop:`1px solid ${cardB}`}}>
              <div style={{fontSize:11,color:sub,marginBottom:5}}>Vault Contract</div>
              <a href={exAddr(v.address)} target="_blank" rel="noreferrer"
                style={{fontFamily:'var(--font-mono)',fontSize:12,color:em,textDecoration:'none',display:'flex',alignItems:'center',gap:6,wordBreak:'break-all'}}>
                {v.address} <IconExternalLink size={12} color={em}/>
              </a>
            </div>
          </div>
        </div>
        <Footer/>
      </div>
    );
  };

  // ── HISTORY ───────────────────────────────────────────────────────────────
  const History=()=>{
    const settled=vaults.filter(v=>v.status===5||v.status===6||v.status===7);
    const active=vaults.filter(v=>v.status<5&&v.status!==7);
    return(
      <div style={{paddingTop:62,minHeight:'100vh',background:bg}}>
        <div style={{padding:'40px 24px 60px',maxWidth:900,margin:'0 auto'}}>
          <div style={{marginBottom:32}}>
            <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 5px',color:tx}}>Vault History</h1>
            <p style={{color:sub,margin:0,fontSize:13.5}}>All vaults associated with your wallet</p>
          </div>

          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:32}}>
            {[
              {label:'Total Vaults',val:vaults.length,color:tx},
              {label:'Active',val:active.length,color:em},
              {label:'Settled / Cancelled',val:settled.length,color:'#F59E0B'},
            ].map(s=>(
              <div key={s.label} style={{...cardS,padding:'20px 22px'}}>
                <div style={{fontSize:30,fontWeight:800,color:s.color,fontFamily:'var(--font-mono)',marginBottom:5}}>{s.val}</div>
                <div style={{fontSize:12,color:sub}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Vault table */}
          {vaults.length===0 ? (
            <div style={{...cardS,padding:60,textAlign:'center'}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'rgba(0,201,122,0.07)',border:'1px solid rgba(0,201,122,0.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                <IconInbox size={28} color={sub}/>
              </div>
              <p style={{color:sub,fontSize:14}}>{vaultsLoading?'Loading...' :'No vaults found. Create your first one from the Dashboard.'}</p>
            </div>
          ):(
            <div style={{...cardS,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'1.4fr 2.2fr 1fr 1fr',gap:12,padding:'12px 22px',borderBottom:`1px solid ${cardB}`,opacity:0.45}}>
                {['Vault','Description','Amount','Status'].map(h=>(
                  <div key={h} style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:'var(--font-mono)'}}>{h}</div>
                ))}
              </div>
              {vaults.map((v,i)=>(
                <div key={v.address}
                  style={{
                    display:'grid',gridTemplateColumns:'1.4fr 2.2fr 1fr 1fr',
                    gap:12,padding:'15px 22px',
                    borderBottom:i<vaults.length-1?`1px solid ${cardB}`:'none',
                    cursor:'pointer',transition:'background 0.15s ease',
                    alignItems:'center'
                  }}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background=iB}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background='transparent'}
                  onClick={()=>{setSelected(v);setPage('detail');}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:em}}>{fmt(v.address)}</div>
                  <div style={{fontSize:13,color:tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.description}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:tx}}>${fmtUsdc(v.amount)}</div>
                  <div><Badge s={VS[v.status]}/></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer/>
      </div>
    );
  };

  // ── Root render ───────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:'100vh',background:bg,color:tx,fontFamily:'var(--font-sans)',transition:'background 0.4s ease'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        @keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-up { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:none;} }
        @keyframes slide-in { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:none;} }
        button { transition: all 0.16s ease; }
        button:hover:not(:disabled) { opacity: 0.86; transform: translateY(-1px); }
        button:active:not(:disabled) { transform: translateY(0); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,201,122,0.2); border-radius: 4px; }
        .grid-pattern {
          position: absolute; inset: 0; opacity: 0.027;
          background-image: linear-gradient(rgba(0,201,122,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,201,122,1) 1px, transparent 1px);
          background-size: 48px 48px; pointer-events: none;
        }
        .glow-orb {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(0,201,122,0.055) 0%, transparent 65%);
          pointer-events: none;
        }
        .section-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #00C97A;
          margin-bottom: 10px; font-family: 'JetBrains Mono', monospace;
          display: block;
        }
        input:focus, textarea:focus { border-color: rgba(0,201,122,0.4) !important; }
        @media (max-width: 640px) {
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>

      
      {Hdr}
      <WrongNet/>
      <TxToast/>
      {showCreate && (
        <div
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',backdropFilter:'blur(12px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}
          onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}>
          <div style={{...cardS,padding:36,width:'100%',maxWidth:468,animation:'fade-up 0.25s ease'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
              <div>
                <h2 style={{margin:'0 0 4px',fontWeight:800,fontSize:20,color:tx}}>Create New Vault</h2>
                <p style={{color:sub,fontSize:13}}>Once funded, USDC is locked until settlement.</p>
              </div>
              <button style={{background:'transparent',border:'none',color:sub,padding:4,cursor:'pointer',display:'flex'}} onClick={()=>setShowCreate(false)}>
                <IconClose size={18} color={sub}/>
              </button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div>
                <label style={{fontSize:12,color:sub,display:'block',marginBottom:6,fontWeight:500}}>Specialist Wallet Address</label>
                <input style={inputS} placeholder="0x..." value={createSpec} onChange={e=>setCreateSpec(e.target.value)}/>
              </div>
              <div>
                <label style={{fontSize:12,color:sub,display:'block',marginBottom:6,fontWeight:500}}>Amount (USDC)</label>
                <input style={inputS} placeholder="e.g. 500" type="number" min="1" value={createAmt} onChange={e=>setCreateAmt(e.target.value)}/>
                <div style={{fontSize:11,color:sub,marginTop:5}}>Gas fees are paid in USDC on Arc Network.</div>
              </div>
              <div>
                <label style={{fontSize:12,color:sub,display:'block',marginBottom:6,fontWeight:500}}>Service Description</label>
                <textarea style={{...inputS,resize:'vertical',minHeight:84}} placeholder="Describe the deliverable clearly - this defines the terms of your deal." value={createDesc} onChange={e=>setCreateDesc(e.target.value)}/>
              </div>
              <div>
                <label style={{fontSize:12,color:sub,display:'block',marginBottom:6,fontWeight:500}}>Vault Deadline</label>
                <select
                  value={customMode ? -1 : selectedDays}
                  onChange={e=>{
                    const v=parseInt(e.target.value);
                    if(v===-1){setCustomMode(true);}
                    else{setCustomMode(false);setSelectedDays(v);}
                  }}
                  style={{...inputS,cursor:'pointer',background:dark?'#0F0F14':'#fff',color:dark?'#E0E0E0':'#111111'}}>
                  <option value={7}>7 days from now</option>
                  <option value={14}>14 days from now</option>
                  <option value={30}>30 days from now</option>
                  <option value={60}>60 days from now</option>
                  <option value={90}>90 days from now</option>
                  <option value={-1}>Custom...</option>
                </select>
                {customMode && (
                  <input
                    type="number" min="1" max="365"
                    placeholder="Enter number of days (e.g. 2)"
                    value={selectedDays > 0 && ![7,14,30,60,90].includes(selectedDays) ? selectedDays : ''}
                    style={{...inputS,marginTop:8}}
                    onChange={e=>{
                      const v=parseInt(e.target.value);
                      if(v>0) setSelectedDays(v);
                    }}
                  />
                )}
                <div style={{fontSize:11,color:sub,marginTop:5}}>After this date, you can reclaim funds if work is not completed.</div>
              </div>
              <div style={{background:'rgba(0,201,122,0.05)',border:'1px solid rgba(0,201,122,0.15)',borderRadius:9,padding:'11px 14px',fontSize:12,color:sub,lineHeight:1.6}}>
                No ArcSentry fees during testnet. The specialist must accept before you can fund.
              </div>
              <div style={{display:'flex',gap:10,marginTop:4}}>
                <button style={{...btn('primary'),flex:1,justifyContent:'center',opacity:loading?0.5:1}} onClick={createVault} disabled={loading}>
                  {loading?'Creating...':'Create Vault'}
                </button>
                <button style={btn('ghost')} onClick={()=>setShowCreate(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCircleLogin && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',backdropFilter:'blur(12px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}
          onClick={e=>{if(e.target===e.currentTarget){setShowCircleLogin(false);setCircleStep('idle');setCircleError('');}}}>
          <div style={{...cardS,padding:36,width:'100%',maxWidth:420,animation:'fade-up 0.25s ease'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
              <div>
                <h2 style={{margin:'0 0 4px',fontWeight:800,fontSize:20,color:tx}}>Email Login</h2>
                <p style={{color:sub,fontSize:13}}>A Circle wallet will be created for you automatically.</p>
              </div>
              <button style={{background:'transparent',border:'none',color:sub,padding:4,cursor:'pointer',display:'flex'}}
                onClick={()=>{setShowCircleLogin(false);setCircleStep('idle');setCircleError('');}}>
                <IconClose size={18} color={sub}/>
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:12,color:sub,display:'block',marginBottom:6,fontWeight:500}}>Your Email</label>
                <input
                  style={inputS}
                  type="email"
                  placeholder="you@email.com"
                  value={circleEmail}
                  onChange={e=>setCircleEmail(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&circleLogin()}
                />
              </div>

              {circleError && (
                <div style={{padding:'10px 14px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:9,fontSize:12,color:'#EF4444'}}>
                  {circleError}
                </div>
              )}

              <div style={{background:'rgba(0,201,122,0.05)',border:'1px solid rgba(0,201,122,0.15)',borderRadius:9,padding:'11px 14px',fontSize:12,color:sub,lineHeight:1.6}}>
                A non-custodial wallet is created server-side via Circle. Your email is not stored on-chain.
              </div>

              <button
                style={{...btn('primary'),justifyContent:'center',opacity:circleLoading?0.5:1}}
                onClick={circleLogin}
                disabled={circleLoading||!circleEmail}>
                {circleLoading ? 'Creating wallet...' : 'Continue with Email'}
              </button>

              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,height:1,background:cardB}}/>
                <span style={{fontSize:11,color:sub}}>or</span>
                <div style={{flex:1,height:1,background:cardB}}/>
              </div>

              <button style={{...btn('ghost'),justifyContent:'center'}}
                onClick={()=>{setShowCircleLogin(false);connectWallet();}}>
                Connect with Rabby / MetaMask
              </button>
            </div>
          </div>
        </div>
      )}

      {page==='landing'   && <Landing/>}
      {page==='dashboard' && <Dashboard/>}
      {page==='detail'    && <Detail/>}
      {page==='history'   && <History/>}
    </div>
  );
}
