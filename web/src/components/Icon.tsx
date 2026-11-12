import {
  Router, Server, HardDrive, Monitor, Printer, Cctv, Wifi, Cpu, Database, Cloud, Gamepad2, Tv,
  House, Lightbulb, Terminal, Network, GraduationCap, Smartphone, Globe, Puzzle, Code, BookOpen,
  Link as LinkIcon, type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  router: Router, server: Server, "hard-drive": HardDrive, monitor: Monitor, printer: Printer,
  cctv: Cctv, wifi: Wifi, cpu: Cpu, database: Database, cloud: Cloud, gamepad: Gamepad2, tv: Tv,
  home: House, light: Lightbulb, terminal: Terminal, network: Network,
  "graduation-cap": GraduationCap, smartphone: Smartphone, globe: Globe, puzzle: Puzzle,
  code: Code, book: BookOpen, link: LinkIcon,
};

export function Icon({ name, className }: { name?: string; className?: string }) {
  const C = (name && map[name]) || LinkIcon;
  return <C className={className} strokeWidth={1.75} />;
}
