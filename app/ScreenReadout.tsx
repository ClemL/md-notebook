"use client";

import { useEffect, useState } from "react";
import { layoutName } from "@/lib/display";

/**
 * The real figures on whatever device is reading, at the foot of the ⋯ menu, so the device test
 * sizes (estimates for the OnePlus Open and the Galaxy Tab S Ultra) can be checked against it.
 * It is mounted only while the menu is open, and follows a fold or a rotation while it is.
 */
export default function ScreenReadout() {
  const [screen, setScreen] = useState("");

  useEffect(() => {
    const describe = () => {
      const ratio = Math.round(window.devicePixelRatio * 1000) / 1000;
      setScreen(`${window.innerWidth} × ${window.innerHeight} CSS pixels at ${ratio}× · ${layoutName(window.innerWidth)}`);
    };
    describe();
    window.addEventListener("resize", describe);
    return () => window.removeEventListener("resize", describe);
  }, []);

  return (
    <p className="screen-readout">
      This screen: <span className="screen-size">{screen}</span>
    </p>
  );
}
