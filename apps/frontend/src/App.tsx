import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useProduct } from "./hooks/useProduct";
import { useWallet, Shell } from "./components/Shell";
import {
  ActivityPage,
  AttentionPage,
  CompetitionPage,
  EarnPage,
  HomePage,
  Landing,
  MarketDetailPage,
  MarketsPage,
  NotificationsPage,
  PortfolioPage,
  ProfilePage,
  ProofPage,
  SettingsPage,
  SystemPage,
} from "./pages";

function ProductApp() {
  const product = useProduct();
  const wallet = useWallet();
  const props = { ...product, wallet };
  return (
    <Routes>
      <Route path="/" element={<Landing {...props} />} />
      <Route
        element={
          <Shell
            health={product.health}
            streamState={product.streamState}
            events={product.events}
            wallet={wallet}
          />
        }
      >
        <Route path="/app" element={<HomePage {...props} />} />
        <Route path="/markets" element={<MarketsPage {...props} />} />
        <Route path="/markets/:marketId" element={<MarketDetailPage {...props} />} />
        <Route path="/portfolio" element={<PortfolioPage {...props} />} />
        <Route path="/activity" element={<ActivityPage {...props} />} />
        <Route path="/earn" element={<EarnPage {...props} />} />
        <Route path="/profile/:address" element={<ProfilePage {...props} />} />
        <Route path="/competitions" element={<CompetitionPage {...props} />} />
        <Route path="/competitions/:id" element={<CompetitionPage {...props} />} />
        <Route path="/notifications" element={<NotificationsPage {...props} />} />
        <Route path="/attention" element={<AttentionPage {...props} />} />
        <Route path="/proof" element={<ProofPage {...props} />} />
        <Route path="/system" element={<SystemPage {...props} />} />
        <Route path="/settings" element={<SettingsPage {...props} />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProductApp />
    </BrowserRouter>
  );
}
