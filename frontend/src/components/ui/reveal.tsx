import { motion, useReducedMotion } from "motion/react";
import type React from "react";

interface Props {
  /** Stagger index; the caller caps the total so entrances never drag. */
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Entrance choreography for workspace sections: a short spring rise, staggered.
 * Honours prefers-reduced-motion by rendering the final state immediately -
 * motion here is reinforcement, so removing it costs nothing.
 */
export const Reveal: React.FC<Props> = ({ delay = 0, className, children }) => {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30, delay: delay * 0.045 }}
    >
      {children}
    </motion.div>
  );
};
