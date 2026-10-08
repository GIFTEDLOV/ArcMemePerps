import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { WinnerApp } from "./WinnerApp";

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  return <BrowserRouter><ScrollToTop /><WinnerApp /></BrowserRouter>;
}
