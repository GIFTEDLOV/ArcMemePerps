import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { Availability, Health, RealtimeEvent } from "../lib/types";
import { DeploymentLabel, HealthStrip, SidebarLink } from "./ui";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(() =>
    localStorage.getItem("arcmemeperps.wallet"),
  );
  const [chainId, setChainId] = useState<string | null>(null);
  const [state, setState] = useState<"DISCONNECTED" | "CONNECTED" | "WRONG_NETWORK" | "REJECTED">(
    address ? "CONNECTED" : "DISCONNECTED",
  );
  async function connect() {
    if (!window.ethereum) {
      setState("DISCONNECTED");
      return;
    }
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const selected = accounts[0] ?? null;
      const currentChain = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setAddress(selected);
      setChainId(currentChain);
      setState(currentChain === "0x4ce952" ? "CONNECTED" : "WRONG_NETWORK");
      if (selected) localStorage.setItem("arcmemeperps.wallet", selected);
    } catch {
      setState("REJECTED");
    }
  }
  async function switchNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x4ce952" }],
      });
      setChainId("0x4ce952");
      setState("CONNECTED");
    } catch {
      setState("REJECTED");
    }
  }
  function disconnect() {
    localStorage.removeItem("arcmemeperps.wallet");
    setAddress(null);
    setState("DISCONNECTED");
  }
  return { address, chainId, state, connect, switchNetwork, disconnect };
}

export function Shell({
  health,
  streamState,
  events,
  wallet,
}: {
  health: Health | null;
  streamState: Availability | "LIVE";
  events: RealtimeEvent[];
  wallet: ReturnType<typeof useWallet>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (search.trim()) void navigate(`/markets?search=${encodeURIComponent(search.trim())}`);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/app" className="brand">
          <span className="brand-mark">A</span>
          <span>
            ArcMeme<strong>Perps</strong>
          </span>
        </Link>
        <div className="side-section">
          <span className="side-label">Terminal</span>
          <SidebarLink
            to="/app"
            label="Command center"
            icon="⌂"
            active={location.pathname === "/app"}
          />
          <SidebarLink
            to="/markets"
            label="Markets"
            icon="◫"
            active={location.pathname.startsWith("/markets")}
          />
          <SidebarLink
            to="/portfolio"
            label="Portfolio"
            icon="◒"
            active={location.pathname.startsWith("/portfolio")}
          />
          <SidebarLink
            to="/activity"
            label="Activity"
            icon="↯"
            active={location.pathname.startsWith("/activity")}
          />
          <SidebarLink
            to="/earn"
            label="Earn / LP"
            icon="◈"
            active={location.pathname.startsWith("/earn")}
          />
        </div>
        <div className="side-section">
          <span className="side-label">Research</span>
          <SidebarLink
            to="/competitions"
            label="Competitions"
            icon="◇"
            active={location.pathname.startsWith("/competitions")}
          />
          <SidebarLink
            to="/proof"
            label="Proof & security"
            icon="✓"
            active={location.pathname.startsWith("/proof")}
          />
        </div>
        <div className="side-bottom">
          <Link to="/settings" className="side-link">
            <span>⚙</span>Settings
          </Link>
          <div className="security-note">
            <span className="live-dot live" />
            Product deployment
            <br />
            <small>Stress state isolated</small>
          </div>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <form className="global-search" onSubmit={submitSearch}>
            <span>⌕</span>
            <input
              id="global-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search token, address, market ID"
              aria-label="Search markets"
            />
            <kbd>⌘ K</kbd>
          </form>
          <div className="top-actions">
            <NavLink to="/notifications" className="icon-button" aria-label="Notifications">
              ◔{events.length > 0 && <i />}
            </NavLink>
            <button
              className={`wallet-button wallet-${wallet.state.toLowerCase()}`}
              onClick={() =>
                wallet.state === "WRONG_NETWORK"
                  ? void wallet.switchNetwork()
                  : wallet.address
                    ? wallet.disconnect()
                    : void wallet.connect()
              }
            >
              <span className="wallet-dot" />
              {wallet.state === "WRONG_NETWORK"
                ? "Switch to Arc Testnet"
                : wallet.address
                  ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                  : "Connect wallet"}
            </button>
            <div className="network-chip">
              <span className="live-dot live" />
              <DeploymentLabel />
            </div>
          </div>
        </header>
        <HealthStrip health={health} streamState={streamState} />
        <div className="page-wrap">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
