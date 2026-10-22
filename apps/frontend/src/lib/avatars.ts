export interface TraderAvatar {
  id: string;
  name: string;
  title: string;
  category: "meme" | "crypto" | "arc";
  icon: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
}

export const AVATAR_LIST: TraderAvatar[] = [
  {
    id: "arc",
    name: "Arc Guardian",
    title: "Chain 5042 Sentinel",
    category: "arc",
    icon: "🛡️",
    bgGradient: "linear-gradient(135deg, #00f5a0 0%, #00d4ff 100%)",
    borderColor: "#00f5a0",
    textColor: "#000000",
    glowColor: "rgba(0, 245, 160, 0.4)",
  },
  {
    id: "bull",
    name: "Arc Bull",
    title: "Perp Leviathan",
    category: "arc",
    icon: "🐂",
    bgGradient: "linear-gradient(135deg, #06b6d4 0%, #10b981 100%)",
    borderColor: "#22d3ee",
    textColor: "#ffffff",
    glowColor: "rgba(6, 182, 212, 0.4)",
  },
  {
    id: "doge",
    name: "Doge Perps",
    title: "Meme Kingpin",
    category: "meme",
    icon: "🐶",
    bgGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    borderColor: "#fbbf24",
    textColor: "#ffffff",
    glowColor: "rgba(245, 158, 11, 0.4)",
  },
  {
    id: "pepe",
    name: "Pepe Chad",
    title: "Green Candle Shaman",
    category: "meme",
    icon: "🐸",
    bgGradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    borderColor: "#34d399",
    textColor: "#ffffff",
    glowColor: "rgba(16, 185, 129, 0.4)",
  },
  {
    id: "ape",
    name: "Diamond Ape",
    title: "Bored Degenerate",
    category: "crypto",
    icon: "🦍",
    bgGradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    borderColor: "#a78bfa",
    textColor: "#ffffff",
    glowColor: "rgba(139, 92, 246, 0.4)",
  },
  {
    id: "samurai",
    name: "Cyber Samurai",
    title: "Orderbook Slicer",
    category: "crypto",
    icon: "⚡",
    bgGradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    borderColor: "#60a5fa",
    textColor: "#ffffff",
    glowColor: "rgba(59, 130, 246, 0.4)",
  },
  {
    id: "astro",
    name: "Cosmic Voyager",
    title: "To The Moon",
    category: "crypto",
    icon: "🪐",
    bgGradient: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
    borderColor: "#818cf8",
    textColor: "#ffffff",
    glowColor: "rgba(99, 102, 241, 0.4)",
  },
  {
    id: "sorcerer",
    name: "Quant Sorcerer",
    title: "Alpha Alchemist",
    category: "crypto",
    icon: "🧙‍♂️",
    bgGradient: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
    borderColor: "#f472b6",
    textColor: "#ffffff",
    glowColor: "rgba(236, 72, 153, 0.4)",
  },
  {
    id: "cat",
    name: "Lucky Neko",
    title: "100x Degen Cat",
    category: "meme",
    icon: "🐱",
    bgGradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
    borderColor: "#fb7185",
    textColor: "#ffffff",
    glowColor: "rgba(244, 63, 94, 0.4)",
  },
  {
    id: "whale",
    name: "Whale Sovereign",
    title: "Deep Liquidity King",
    category: "crypto",
    icon: "🐋",
    bgGradient: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
    borderColor: "#38bdf8",
    textColor: "#ffffff",
    glowColor: "rgba(2, 132, 199, 0.4)",
  },
  {
    id: "rocket",
    name: "Rocket Pilot",
    title: "Escape Velocity",
    category: "meme",
    icon: "🚀",
    bgGradient: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)",
    borderColor: "#fb923c",
    textColor: "#ffffff",
    glowColor: "rgba(234, 88, 12, 0.4)",
  },
  {
    id: "diamond",
    name: "Diamond Hands",
    title: "Unshakable Conviction",
    category: "crypto",
    icon: "💎",
    bgGradient: "linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)",
    borderColor: "#22d3ee",
    textColor: "#ffffff",
    glowColor: "rgba(6, 182, 212, 0.4)",
  },
];

export function getTraderAvatar(idOrInitials: string): TraderAvatar {
  const found = AVATAR_LIST.find((a) => a.id.toLowerCase() === (idOrInitials || "").toLowerCase());
  if (found) return found;

  // Fallback for custom or legacy initial avatars like "ARC"
  return {
    id: idOrInitials || "arc",
    name: idOrInitials || "Arc Trader",
    title: "Arc Pioneer",
    category: "arc",
    icon: idOrInitials ? idOrInitials.slice(0, 3).toUpperCase() : "ARC",
    bgGradient: "linear-gradient(135deg, rgba(0, 245, 160, 0.2), rgba(0, 212, 255, 0.25))",
    borderColor: "#00f5a0",
    textColor: "#00f5a0",
    glowColor: "rgba(0, 245, 160, 0.3)",
  };
}
