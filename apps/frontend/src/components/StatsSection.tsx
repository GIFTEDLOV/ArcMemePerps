import { useEffect, useRef } from "react";
import { animate, motion, useInView } from "motion/react";

export interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate(val) {
        if (ref.current) {
          ref.current.textContent = `${prefix}${val.toFixed(decimals)}${suffix}`;
        }
      },
    });
    return () => controls.stop();
  }, [inView, value, prefix, suffix, decimals]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

export interface TypewriterProps {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
}

export function Typewriter({
  text,
  delay = 0,
  speed = 0.015,
  className = "",
}: TypewriterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10px" });

  const parentVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: speed,
        delayChildren: delay,
      },
    },
  };

  const childVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const characters = Array.from(text);

  return (
    <motion.span
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={parentVariants}
    >
      {characters.map((char, index) => (
        <motion.span key={index} variants={childVariants}>
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}

const MASK_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='m53.54,45.42c2.19-3.79,7.67-3.79,9.86,0l4.54,7.87c1.17,2.02,1.17,4.51,0,6.54l-8.15,13.81c-1.68,2.91.42,6.55,3.78,6.55h17.81c3.45,0,5.61-3.74,3.89-6.73l-28.76-49.81c-2.95-5.12-10.34-5.12-13.29,0l-28.46,49.3c-1.86,3.22.46,7.24,4.18,7.24h10.23c2.55,0,4.91-1.36,6.19-3.57l18.18-31.19Z'/%3E%3C/svg%3E`;

const leftColumnVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const statsGridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const statItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut" as const,
    },
  },
};

export function StatsSection() {
  return (
    <section
      id="stats"
      className="bg-black/40 backdrop-blur-xs text-white py-12 md:py-28 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 overflow-hidden"
    >
      <div className="w-full max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-[160px] items-stretch">
          {/* Left Column */}
          <motion.div
            className="flex-1 flex flex-col justify-start"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={leftColumnVariants}
          >
            <h2 className="text-[clamp(1.5rem,4vw,3.5rem)] font-medium tracking-tight mb-6 leading-[1.1] w-[590px] max-w-full">
              <Typewriter text="Powering Harvests" delay={0} speed={0.012} />
              <br />
              <Typewriter text="that " delay={0.25} speed={0.012} />
              <span className="font-dm-serif italic font-normal">
                <Typewriter text="Maximize Your Yield" delay={0.35} speed={0.012} />
              </span>
            </h2>

            <p className="text-base md:text-lg text-white/40 leading-relaxed font-light max-w-lg whitespace-normal mb-16">
              <Typewriter
                text="For over a decade, the region's most demanding agricultural operations have relied on our modern machinery and skilled crews to secure their crops efficiently and reduce loss."
                delay={0.1}
                speed={0.012}
              />
            </p>

            <motion.div
              className="grid grid-cols-2 md:grid-cols-[max-content_max-content] gap-8 md:gap-x-16 lg:gap-x-24"
              variants={statsGridVariants}
            >
              {/* Stat 1 */}
              <motion.div className="flex flex-col" variants={statItemVariants}>
                <div className="text-4xl md:text-5xl lg:text-[56px] font-dm-serif tracking-tight mb-3">
                  <AnimatedCounter value={500} suffix="K+" />
                </div>
                <div className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Acres Harvested Annually
                </div>
              </motion.div>

              {/* Stat 2 */}
              <motion.div className="flex flex-col" variants={statItemVariants}>
                <div className="text-4xl md:text-5xl lg:text-[56px] font-dm-serif tracking-tight mb-3">
                  <AnimatedCounter value={99.8} decimals={1} suffix="%" />
                </div>
                <div className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Crop Recovery Rate
                </div>
              </motion.div>

              {/* Stat 3 */}
              <motion.div className="flex flex-col" variants={statItemVariants}>
                <div className="text-4xl md:text-5xl lg:text-[56px] font-dm-serif tracking-tight mb-3">
                  <AnimatedCounter value={50} suffix="+" />
                </div>
                <div className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Modern Combines Deployed
                </div>
              </motion.div>

              {/* Stat 4 */}
              <motion.div className="flex flex-col" variants={statItemVariants}>
                <div className="text-4xl md:text-5xl lg:text-[56px] font-dm-serif tracking-tight mb-3">
                  <AnimatedCounter value={15} suffix="+" />
                </div>
                <div className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Crop Varieties Supported
                </div>
              </motion.div>

              {/* Stat 5 */}
              <motion.div className="flex flex-col" variants={statItemVariants}>
                <div className="text-4xl md:text-5xl lg:text-[56px] font-dm-serif tracking-tight mb-3">
                  <AnimatedCounter value={24} suffix="/7" />
                </div>
                <div className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Uptime During Season
                </div>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Right Column: Logo-Masked Video */}
          <div className="flex justify-center lg:justify-end items-center shrink-0 lg:w-1/2">
            <motion.div
              className="w-full max-w-[500px] lg:max-w-none lg:w-[120%] aspect-square origin-center"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1.2 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0, ease: "easeOut" }}
              style={{
                WebkitMaskImage: `url("${MASK_SVG}")`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: `url("${MASK_SVG}")`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                src="https://app-uploads.krea.ai/wan-videos/7f348c17-c3aa-40c9-9d5b-a2bed9a72c2e.mp4"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
