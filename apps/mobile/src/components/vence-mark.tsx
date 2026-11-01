import Svg, { Circle, Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

/** Фирменный знак Vence: незамкнутое кольцо и геометрическая V внутри. */
export function VenceMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="vence-accent" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFD86B" />
          <Stop offset="100%" stopColor="#FFB81F" />
        </LinearGradient>
      </Defs>
      <Circle
        cx={512}
        cy={512}
        r={300}
        fill="none"
        stroke="url(#vence-accent)"
        strokeWidth={78}
        strokeLinecap="round"
        strokeDasharray="1620 265"
        transform="rotate(-58 512 512)"
      />
      <Polygon points="397,387 463,387 512,541 561,387 627,387 549,637 475,637" fill="url(#vence-accent)" />
    </Svg>
  );
}
