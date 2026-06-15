import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/grupos")({
  component: GruposLayout,
});

function GruposLayout() {
  return <Outlet />;
}
