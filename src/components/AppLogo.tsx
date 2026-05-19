import logo from "@/assets/cine-estrella-logo.png";

export function AppLogo({ size = 200 }: { size?: number }) {
  return (
    <img
      src={logo}
      alt="Cine Estrella"
      style={{ width: size, height: "auto" }}
      className="select-none drop-shadow-[0_0_30px_oklch(0.78_0.16_60/0.25)]"
    />
  );
}
