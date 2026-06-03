'use client';

import { useState } from 'react';

const em = '#00C97A';
const bg = '#08080B';
const card = 'rgba(15,15,20,0.95)';
const cardB = 'rgba(255,255,255,0.07)';
const tx = '#E0E0E0';
const sub = '#888888';
const surfaceCard = '#0F0F14';

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
    <path d="M20 3 L37 15 L37 29 L20 37 L3 29 L3 15 Z" stroke="#00C97A" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    <path d="M11 15 Q20 8 29 15" stroke="#00C97A" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <line x1="20" y1="9" x2="20" y2="31" stroke="#00C97A" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="20" cy="20" r="2.5" fill="#00C97A"/>
  </svg>
);

const IconExternalLink = ({size=12,color='currentColor'}:{size?:number;color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const sections = [
  { id:'overview',    label:'Overview' },
  { id:'how-it-works',label:'How it Works' },
  { id:'vault-states',label:'Vault States' },
  { id:'actions',     label:'Actions' },
  { id:'disputes',    label:'Disputes' },
  { id:'fees',        label:'Fees and Gas' },
  { id:'security',    label:'Security' },
  { id:'arc-network', label:'Arc Network' },
  { id:'faq',         label:'FAQ' },
];

const Code = ({children}:{children:string}) => (
  <code style={{
    fontFamily:"'JetBrains Mono',monospace",
    fontSize:12,
    background:'rgba(0,201,122,0.08)',
    border:'1px solid rgba(0,201,122,0.15)',
    borderRadius:5,
    padding:'2px 7px',
    color:em,
  }}>{children}</code>
);

const SectionTitle = ({id,children}:{id:string;children:React.ReactNode}) => (
  <h2 id={id} style={{
    fontSize:22,fontWeight:800,color:tx,
    margin:'0 0 16px',paddingTop:8,
    scrollMarginTop:80
  }}>{children}</h2>
);

const SubTitle = ({children}:{children:React.ReactNode}) => (
  <h3 style={{fontSize:15,fontWeight:700,color:tx,margin:'24px 0 10px'}}>{children}</h3>
);

const P = ({children}:{children:React.ReactNode}) => (
  <p style={{fontSize:14,color:sub,lineHeight:1.8,margin:'0 0 16px'}}>{children}</p>
);

const statusColors: Record<string,{color:string;bg:string;border:string}> = {
  'Draft':             {color:'#9CA3AF',bg:'rgba(156,163,175,0.08)',border:'rgba(156,163,175,0.2)'},
  'Accepted':          {color:'#60A5FA',bg:'rgba(96,165,250,0.10)', border:'rgba(96,165,250,0.25)'},
  'Funded':            {color:'#00C97A',bg:'rgba(0,201,122,0.10)',  border:'rgba(0,201,122,0.3)'},
  'Release Requested': {color:'#F59E0B',bg:'rgba(245,158,11,0.10)',border:'rgba(245,158,11,0.25)'},
  'Disputed':          {color:'#EF4444',bg:'rgba(239,68,68,0.10)',  border:'rgba(239,68,68,0.25)'},
  'Completed':         {color:'#00C97A',bg:'rgba(0,201,122,0.08)',  border:'rgba(0,201,122,0.2)'},
  'Refunded':          {color:'#F59E0B',bg:'rgba(245,158,11,0.10)',border:'rgba(245,158,11,0.2)'},
  'Cancelled':         {color:'#EF4444',bg:'rgba(239,68,68,0.07)',  border:'rgba(239,68,68,0.18)'},
};

const StatusBadge = ({s}:{s:string}) => {
  const c = statusColors[s] || statusColors['Draft'];
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',
      background:c.bg,color:c.color,
      border:`1px solid ${c.border}`,
      borderRadius:20,padding:'3px 10px',
      fontSize:11,fontFamily:"'JetBrains Mono',monospace",
      fontWeight:700,letterSpacing:'0.04em',whiteSpace:'nowrap'
    }}>{s}</span>
  );
};

export default function Docs() {
  const [active, setActive] = useState('overview');

  const scrollTo = (id:string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
  };

  return (
    <div style={{minHeight:'100vh',background:bg,color:tx,fontFamily:"'Inter',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,201,122,0.2); border-radius: 4px; }
      `}</style>

      {/* Top nav */}
      <div style={{
        position:'fixed',top:0,left:0,right:0,zIndex:100,
        background:'rgba(8,8,11,0.94)',backdropFilter:'blur(22px)',
        borderBottom:`1px solid ${cardB}`,height:60,
        display:'flex',alignItems:'center',padding:'0 28px',
        justifyContent:'space-between'
      }}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:9,textDecoration:'none'}}>
          <Logo/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:em,letterSpacing:'0.06em'}}>ArcSentry</span>
          <span style={{fontSize:11,color:sub,marginLeft:4,fontFamily:"'JetBrains Mono',monospace"}}>/ docs</span>
        </a>
        <div style={{display:'flex',gap:16,alignItems:'center'}}>
          <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
            style={{fontSize:12,color:sub,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
            Explorer <IconExternalLink size={11} color={sub}/>
          </a>
          <a href="/" style={{
            background:'linear-gradient(135deg,#00C97A,#00A862)',
            color:'#000',border:'none',borderRadius:8,
            padding:'7px 16px',fontSize:12,fontWeight:700,
            textDecoration:'none',cursor:'pointer'
          }}>Launch App</a>
        </div>
      </div>

      <div style={{display:'flex',paddingTop:60,maxWidth:1160,margin:'0 auto'}}>

        {/* Sidebar */}
        <div style={{
          width:220,flexShrink:0,position:'sticky',top:60,
          height:'calc(100vh - 60px)',overflowY:'auto',
          padding:'32px 20px',
          borderRight:`1px solid ${cardB}`
        }}>
          <div style={{fontSize:10,fontWeight:700,color:sub,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:"'JetBrains Mono',monospace",marginBottom:14}}>Contents</div>
          {sections.map(s=>(
            <button key={s.id}
              onClick={()=>scrollTo(s.id)}
              style={{
                display:'block',width:'100%',textAlign:'left',
                background:active===s.id?'rgba(0,201,122,0.08)':'transparent',
                color:active===s.id?em:sub,
                border:'none',
                borderLeft:`2px solid ${active===s.id?em:'transparent'}`,
                borderRadius:'0 6px 6px 0',
                padding:'8px 12px',cursor:'pointer',
                fontSize:13,fontWeight:active===s.id?600:400,
                marginBottom:2,
                transition:'all 0.15s ease'
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{flex:1,padding:'40px 48px 80px',maxWidth:760}}>

          {/* Overview */}
          <div style={{marginBottom:52}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:em,fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}>Documentation</div>
            <SectionTitle id="overview">ArcSentry Overview</SectionTitle>
            <P>ArcSentry is a decentralized escrow protocol built on Arc Network. It allows two parties - a Client and a Specialist - to execute deals in a trustless environment without intermediaries.</P>
            <P>Funds (USDC) are locked in a smart contract called a <strong style={{color:tx}}>Vault</strong>. The Vault only releases funds when both parties agree, or when an admin arbitrator resolves a dispute. Neither party - nor ArcSentry itself - can unilaterally move funds once a vault is funded.</P>
            <div style={{
              background:surfaceCard,border:`1px solid rgba(0,201,122,0.15)`,
              borderRadius:12,padding:'18px 20px',marginTop:20
            }}>
              <div style={{fontSize:12,fontWeight:700,color:em,marginBottom:10,fontFamily:"'JetBrains Mono',monospace"}}>Quick facts</div>
              {[
                ['Chain','Arc Testnet (Chain ID: 5042002)'],
                ['Token','USDC (6 decimals)'],
                ['Gas token','USDC (native on Arc)'],
                ['Explorer','testnet.arcscan.app'],
                ['Status','Testnet - unaudited'],
              ].map(([k,v])=>(
                <div key={k} style={{display:'flex',gap:16,fontSize:13,paddingBottom:8,borderBottom:`1px solid ${cardB}`,marginBottom:8}}>
                  <span style={{color:sub,minWidth:100}}>{k}</span>
                  <span style={{color:tx,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="how-it-works">How it Works</SectionTitle>
            <P>A vault moves through a defined lifecycle. Each stage has a specific set of actions available to the Client and Specialist.</P>
            {[
              {n:'01',title:'Client creates the vault',desc:'The Client calls createVault() on the Factory contract, specifying the Specialist wallet, USDC amount, and a description of the deliverable. The vault is deployed as a standalone contract. Status: Draft.'},
              {n:'02',title:'Specialist accepts',desc:'The Specialist reviews the terms and calls acceptVault(). This commits them to the deal. No funds move at this stage. Status: Accepted.'},
              {n:'03',title:'Client funds',desc:'The Client approves the vault contract to spend their USDC, then calls fundVault(). USDC is transferred from the Client\'s wallet into the vault contract. Status: Funded.'},
              {n:'04',title:'Work is delivered',desc:'The Specialist completes the deliverable. They call requestRelease() to signal completion. Status: Release Requested.'},
              {n:'05',title:'Client approves',desc:'The Client reviews the work and calls releaseFunds(). USDC is transferred to the Specialist. Status: Completed.'},
            ].map(s=>(
              <div key={s.n} style={{display:'flex',gap:16,marginBottom:20}}>
                <div style={{
                  width:32,height:32,borderRadius:'50%',flexShrink:0,
                  background:'rgba(0,201,122,0.09)',
                  border:'1px solid rgba(0,201,122,0.2)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                  fontWeight:700,color:em
                }}>{s.n}</div>
                <div>
                  <div style={{fontSize:13.5,fontWeight:700,color:tx,marginBottom:5}}>{s.title}</div>
                  <div style={{fontSize:13,color:sub,lineHeight:1.7}}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Vault states */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="vault-states">Vault States</SectionTitle>
            <P>Every vault exists in one of eight states at any given time.</P>
            <div style={{
              background:surfaceCard,
              border:`1px solid ${cardB}`,
              borderRadius:12,overflow:'hidden'
            }}>
              <div style={{display:'grid',gridTemplateColumns:'100px 1fr',gap:0}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${cardB}`,fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:"'JetBrains Mono',monospace"}}>Status</div>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${cardB}`,borderLeft:`1px solid ${cardB}`,fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:"'JetBrains Mono',monospace"}}>Description</div>
                {[
                  ['Draft','Vault created, waiting for Specialist to accept. No funds at risk.'],
                  ['Accepted','Specialist accepted. Waiting for Client to fund.'],
                  ['Funded','USDC locked in vault. Work in progress.'],
                  ['Release Requested','Specialist signaled completion. Waiting for Client to approve.'],
                  ['Disputed','Either party raised a dispute. Funds frozen pending admin review.'],
                  ['Completed','Client released funds. USDC sent to Specialist. Terminal state.'],
                  ['Refunded','Specialist approved refund. USDC returned to Client. Terminal state.'],
                  ['Cancelled','Cancelled before funding. No funds moved. Terminal state.'],
                ].map(([s,d],i)=>(
                  <>
                    <div key={`s${i}`} style={{padding:'12px 16px',borderBottom:`1px solid ${cardB}`,display:'flex',alignItems:'center'}}>
                      <StatusBadge s={s}/>
                    </div>
                    <div key={`d${i}`} style={{padding:'12px 16px',borderBottom:`1px solid ${cardB}`,borderLeft:`1px solid ${cardB}`,fontSize:13,color:sub,lineHeight:1.6}}>{d}</div>
                  </>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="actions">Actions Reference</SectionTitle>
            <P>The following on-chain actions are available to each party, depending on the vault state.</P>
            {[
              {
                fn:'acceptVault()',
                who:'Specialist',
                state:'Draft',
                desc:'Commit to the deal terms. Transitions vault to Accepted. No gas cost beyond the transaction fee.'
              },
              {
                fn:'fundVault()',
                who:'Client',
                state:'Accepted',
                desc:'Lock USDC in the vault. Requires prior ERC-20 approval for the vault contract to spend the exact USDC amount. Transitions to Funded.'
              },
              {
                fn:'requestRelease()',
                who:'Specialist',
                state:'Funded',
                desc:'Signal that the work has been delivered and request payment. Transitions to Release Requested.'
              },
              {
                fn:'releaseFunds()',
                who:'Client',
                state:'Release Requested or Disputed',
                desc:'Approve and release USDC to the Specialist. Irreversible. Transitions to Completed.'
              },
              {
                fn:'requestRefund()',
                who:'Client',
                state:'Funded, Release Requested, or Disputed',
                desc:'Signal a refund request. Emits an event but does not change vault status. Specialist must call approveRefund() to complete it.'
              },
              {
                fn:'approveRefund()',
                who:'Specialist',
                state:'Funded, Release Requested, or Disputed',
                desc:'Approve the refund. USDC is returned to the Client. Transitions to Refunded.'
              },
              {
                fn:'dispute()',
                who:'Either party',
                state:'Funded or Release Requested',
                desc:'Escalate to admin arbitration. Funds are frozen. Transitions to Disputed.'
              },
              {
                fn:'cancelVault()',
                who:'Either party',
                state:'Draft or Accepted',
                desc:'Cancel the deal before any funds are locked. Transitions to Cancelled. Only available before Funded state.'
              },
              {
                fn:'resolveDispute(winner)',
                who:'Admin only',
                state:'Disputed',
                desc:'Resolve a dispute. Pass 0 to refund Client, 1 to release to Specialist.'
              },
            ].map(a=>(
              <div key={a.fn} style={{
                background:surfaceCard,border:`1px solid ${cardB}`,
                borderRadius:12,padding:'18px 20px',marginBottom:12
              }}>
                <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',marginBottom:10}}>
                  <Code>{a.fn}</Code>
                  <span style={{fontSize:11,color:sub,background:'rgba(255,255,255,0.04)',border:`1px solid ${cardB}`,borderRadius:6,padding:'2px 9px',fontFamily:"'JetBrains Mono',monospace"}}>{a.who}</span>
                  <span style={{fontSize:11,color:sub}}>when: {a.state}</span>
                </div>
                <div style={{fontSize:13,color:sub,lineHeight:1.7}}>{a.desc}</div>
              </div>
            ))}
          </div>

          {/* Disputes */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="disputes">Dispute Resolution</SectionTitle>
            <P>Either party can raise a dispute on any funded vault. Once raised, the vault enters Disputed state and funds are frozen - no party can unilaterally move them.</P>
            <SubTitle>How disputes work</SubTitle>
            <P>An admin arbitrator reviews the deal terms, description, and any evidence provided by both parties. The arbitrator calls resolveDispute() with either 0 (refund Client) or 1 (release to Specialist).</P>
            <SubTitle>Consensual resolution during a dispute</SubTitle>
            <P>Parties are encouraged to resolve disputes between themselves. During Disputed state, the Client can still call releaseFunds() and the Specialist can still call requestRelease(). The Specialist can also call approveRefund() if the Client has signaled a refund. Consensual resolution is faster and does not require admin involvement.</P>
            <div style={{
              background:'rgba(239,68,68,0.06)',
              border:'1px solid rgba(239,68,68,0.18)',
              borderRadius:10,padding:'14px 18px',fontSize:13,color:sub,lineHeight:1.7
            }}>
              Important: Raising a dispute does not guarantee a refund. The arbitrator decides based on the evidence. Frivolous disputes waste everyone\'s time.
            </div>
          </div>

          {/* Fees */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="fees">Fees and Gas</SectionTitle>
            <P>ArcSentry charges no platform fees during testnet. All costs are limited to Arc Network gas fees, which are paid in USDC.</P>
            <div style={{
              background:surfaceCard,border:`1px solid ${cardB}`,
              borderRadius:12,padding:'18px 20px'
            }}>
              {[
                ['Platform fee','0% during testnet'],
                ['Gas token','USDC (native on Arc)'],
                ['Typical gas per tx','Under $0.01 USDC'],
                ['Approve + Fund','Two transactions required'],
                ['Mainnet fees','To be announced before launch'],
              ].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13,paddingBottom:10,borderBottom:`1px solid ${cardB}`,marginBottom:10}}>
                  <span style={{color:sub}}>{k}</span>
                  <span style={{color:tx,fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="security">Security</SectionTitle>
            <SubTitle>Audit status</SubTitle>
            <P>The ArcSentry smart contracts are currently unaudited. This is a testnet deployment intended for testing and demonstration only. Do not use with real funds or on mainnet.</P>
            <SubTitle>Non-custodial design</SubTitle>
            <P>ArcSentry never holds user funds. Every USDC is locked in the individual vault contract. The ArcSentry team cannot access, freeze, or move vault funds except through the admin dispute resolution function, which only applies to vaults in Disputed state.</P>
            <SubTitle>Contract verification</SubTitle>
            <P>All deployed contracts are verified on the Arcscan block explorer. You can read the full contract source code directly on-chain.</P>
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,color:em,fontSize:13,fontWeight:600,textDecoration:'none'}}>
              View on Arcscan <IconExternalLink size={12} color={em}/>
            </a>
          </div>

          {/* Arc Network */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="arc-network">Arc Network</SectionTitle>
            <P>Arc Network is an EVM-compatible Layer 1 blockchain built by Circle, the company behind USDC. On Arc, USDC is the native gas token - there is no separate gas coin.</P>
            <P>This design means every transaction on Arc Network costs a small amount of USDC, making gas costs predictable and denominated in a stable currency. For ArcSentry users, this means vault creation, funding, releasing, and refunding all cost fractions of a cent in USDC.</P>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:8}}>
              {[
                {label:'Chain ID',val:'5042002'},
                {label:'RPC',val:'rpc.testnet.arc.network'},
                {label:'Explorer',val:'testnet.arcscan.app'},
                {label:'Faucet',val:'faucet.circle.com'},
              ].map(i=>(
                <div key={i.label} style={{background:surfaceCard,border:`1px solid ${cardB}`,borderRadius:9,padding:'11px 15px'}}>
                  <div style={{fontSize:10,color:sub,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:"'JetBrains Mono',monospace"}}>{i.label}</div>
                  <div style={{fontSize:12,color:em,fontFamily:"'JetBrains Mono',monospace"}}>{i.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div style={{marginBottom:52}}>
            <SectionTitle id="faq">FAQ</SectionTitle>
            {[
              {
                q:'Can ArcSentry take my funds?',
                a:'No. ArcSentry cannot move vault funds unilaterally. The only admin function is resolveDispute(), which only applies to vaults in Disputed state and only sends funds to one of the two parties.'
              },
              {
                q:'What if the Specialist disappears after being accepted but before the Client funds?',
                a:'Either party can cancel the vault before it is funded. No funds are at risk in Draft or Accepted states.'
              },
              {
                q:'What if the Client refuses to release after work is delivered?',
                a:'The Specialist can raise a dispute. The admin arbitrator will review the evidence and resolve in favor of the appropriate party.'
              },
              {
                q:'Can I create a vault for any amount of USDC?',
                a:'Yes, as long as the amount is greater than zero and you have sufficient USDC balance to fund it.'
              },
              {
                q:'What wallet should I use?',
                a:'Rabby or MetaMask. ArcSentry prompts your wallet to add Arc Testnet automatically on first connection.'
              },
              {
                q:'Where do I get testnet USDC?',
                a:'Use the Circle USDC testnet faucet at faucet.circle.com. Select the Arc Network option.'
              },
            ].map(item=>(
              <div key={item.q} style={{borderTop:`1px solid ${cardB}`,padding:'18px 0'}}>
                <div style={{fontSize:14,fontWeight:600,color:tx,marginBottom:8}}>{item.q}</div>
                <div style={{fontSize:13,color:sub,lineHeight:1.75}}>{item.a}</div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div style={{
            background:'rgba(0,201,122,0.05)',
            border:'1px solid rgba(0,201,122,0.15)',
            borderRadius:14,padding:'28px 24px',textAlign:'center'
          }}>
            <div style={{fontSize:18,fontWeight:800,color:tx,marginBottom:8}}>Ready to try it?</div>
            <div style={{fontSize:13,color:sub,marginBottom:20}}>ArcSentry is live on Arc Testnet. No fees, no risk - testnet USDC only.</div>
            <a href="/" style={{
              display:'inline-flex',alignItems:'center',gap:8,
              background:'linear-gradient(135deg,#00C97A,#00A862)',
              color:'#000',border:'none',borderRadius:9,
              padding:'12px 24px',fontSize:13,fontWeight:700,
              textDecoration:'none',cursor:'pointer'
            }}>Launch ArcSentry</a>
          </div>
        </div>
      </div>
    </div>
  );
}
