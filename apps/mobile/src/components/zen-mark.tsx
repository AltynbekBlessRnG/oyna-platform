import Svg, { Circle, Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

/** Фирменный знак Zen: незамкнутый круг энсо и геометрическая Z внутри. */
export function ZenMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="zen-accent" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#C6FF57" />
          <Stop offset="55%" stopColor="#7BF0A8" />
          <Stop offset="100%" stopColor="#45E0FF" />
        </LinearGradient>
      </Defs>
      <Circle
        cx={512}
        cy={512}
        r={300}
        fill="none"
        stroke="url(#zen-accent)"
        strokeWidth={78}
        strokeLinecap="round"
        strokeDasharray="1620 265"
        transform="rotate(-58 512 512)"
      />
      <Polygon points="397,387 627,387 627,443 547,581 627,581 627,637 397,637 397,581 477,443 397,443" fill="url(#zen-accent)" />
    </Svg>
  );
}
