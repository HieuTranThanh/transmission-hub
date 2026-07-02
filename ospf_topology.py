"""OSPF Topology — generates interactive HTML network diagram from OSPF audit data.

Reads the OSPF baseline data (output of OSPFAuditReader), builds a NetworkX
undirected graph, computes a 2-D layout, and renders a self-contained HTML file
using vis-network (loaded from CDN) with a professional NMS-style dark theme.

Dependencies:
    networkx  — pip install networkx  (required)
    vis-network — loaded at runtime from CDN (requires internet when opening HTML)
"""
from __future__ import annotations

import json
import math
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

try:
    import networkx as nx
    _HAS_NETWORKX = True
except ImportError:
    nx = None          # type: ignore
    _HAS_NETWORKX = False


# ── Vendor palette ────────────────────────────────────────────────────────────

_VENDOR_COLOR: Dict[str, Dict[str, str]] = {
    "cisco":   {"bg": "#3B82F6", "border": "#1D4ED8"},
    "juniper": {"bg": "#22C55E", "border": "#15803D"},
    "nokia":   {"bg": "#F97316", "border": "#C2410C"},
    "alcatel": {"bg": "#F97316", "border": "#C2410C"},
    "huawei":  {"bg": "#EF4444", "border": "#B91C1C"},
}
_DEFAULT_COLOR   = {"bg": "#64748B", "border": "#475569"}
_DOWN_COLOR      = {"bg": "#374151", "border": "#EF4444"}
_EXTERNAL_COLOR  = {"bg": "#1E3A5F", "border": "#2D5296"}

_VENDOR_DISPLAY: Dict[str, str] = {
    "cisco":   "Cisco",
    "juniper": "Juniper",
    "nokia":   "Nokia / Alcatel",
    "alcatel": "Nokia / Alcatel",
    "huawei":  "Huawei",
}

_EDGE_FULL    = {"color": "#16A34A", "highlight": "#22C55E", "hover": "#22C55E"}
_EDGE_PARTIAL = {"color": "#D97706", "highlight": "#F59E0B", "hover": "#F59E0B"}
_EDGE_UNKNOWN = {"color": "#334155", "highlight": "#475569", "hover": "#475569"}


def _require_networkx() -> None:
    """Import networkx on demand; re-tries even if the module-level import failed."""
    global nx, _HAS_NETWORKX
    if _HAS_NETWORKX:
        return
    try:
        import networkx as _nx
        nx = _nx
        _HAS_NETWORKX = True
    except ImportError:
        raise ImportError(
            "NetworkX is required for OSPF topology visualization.\n"
            "Install it with:  pip install networkx"
        ) from None


# ── P2P subnet helper ─────────────────────────────────────────────────────────

def _nokia_rid_to_mgmt_ip(router_id: str) -> str:
    """Nokia: OSPF Router-ID 3rd octet +1 = management IP."""
    parts = router_id.split(".")
    if len(parts) != 4:
        return ""
    try:
        octets = [int(p) for p in parts]
    except ValueError:
        return ""
    if not all(0 <= o <= 255 for o in octets):
        return ""
    octets[2] += 1
    if octets[2] > 255:
        return ""
    return ".".join(str(o) for o in octets)


def _resolve_from_ip_map(key: str, ip_map: Dict[str, str], default: str = "") -> str:
    """Resolve a value from an IP-keyed map using fallback chain.

    1. key matches a device IP directly
    2. Nokia: key 3rd octet +1 matches a device IP
    """
    if not key or not ip_map:
        return default
    v = ip_map.get(key, "")
    if v:
        return v
    nokia_ip = _nokia_rid_to_mgmt_ip(key)
    if nokia_ip:
        v = ip_map.get(nokia_ip, "")
        if v:
            return v
    return default


def _ips_in_same_p2p_subnet(ip_a: str, ip_b: str) -> bool:
    """Return True if two IPs are in the same /31 or /30 subnet (p2p link)."""
    try:
        a = [int(x) for x in ip_a.split(".")]
        b = [int(x) for x in ip_b.split(".")]
        if len(a) != 4 or len(b) != 4:
            return False
        if a[:3] != b[:3]:
            return False
        la, lb = a[3], b[3]
        return (la >> 1) == (lb >> 1) or (la >> 2) == (lb >> 2)  # /31 or /30
    except Exception:
        return False


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_ospf_graph(
    ospf_data: dict,
    p2p_only: bool = False,
    ip_to_vendor: Optional[Dict[str, str]] = None,
    ip_to_type: Optional[Dict[str, str]] = None,
) -> "nx.Graph":
    """Build a NetworkX undirected graph from OSPF audit data.

    Nodes: known devices (by management IP) + unknown OSPF neighbors.
    Edges: OSPF adjacencies inferred from neighbor tables.
    When p2p_only=True, only edges via pointToPoint interfaces are included
    and isolated nodes are removed.
    *ip_to_vendor* maps device management IPs to vendor strings (from
    devices.xlsx) so external neighbor nodes can be coloured correctly.
    *ip_to_type* maps device management IPs to device type strings.
    """
    _require_networkx()
    G = nx.Graph()

    # router_id → management IP lookup
    rid_to_ip: Dict[str, str] = {}
    for ip, dev in ospf_data.items():
        rid = dev.get("router_id", "")
        if rid:
            rid_to_ip[rid] = ip

    # Pre-compute point-to-point interface IPs per device (used when p2p_only)
    p2p_ips: Dict[str, set] = {}
    if p2p_only:
        for ip, dev in ospf_data.items():
            p2p_ips[ip] = {
                iface["if_ip"]
                for iface in dev.get("interfaces", [])
                if iface.get("if_state") == "pointToPoint" and iface.get("if_ip")
            }

    for ip, dev in ospf_data.items():
        if dev.get("error") in ("SNMP_TIMEOUT", "SNMP_ERROR"):
            status = "down"
        elif dev.get("error"):
            status = "error"
        else:
            status = "up"

        areas = sorted({
            iface.get("area", "")
            for iface in dev.get("interfaces", [])
            if iface.get("area")
        })

        _dev_type = (ip_to_type or {}).get(ip, "")
        G.add_node(
            ip,
            label        = dev.get("device_name") or ip,
            vendor       = dev.get("vendor", "unknown").lower(),
            device_type  = _dev_type,
            router_id    = dev.get("router_id", ""),
            admin_status = dev.get("admin_status", ""),
            status       = status,
            areas        = areas,
            n_interfaces = len(dev.get("interfaces", [])),
            n_neighbors  = len(dev.get("neighbors",  [])),
            node_type    = "known",
        )

    # Build per-device interface list for edge tooltip lookups
    _dev_ifaces: Dict[str, List[dict]] = {}
    for ip, dev in ospf_data.items():
        _dev_ifaces[ip] = dev.get("interfaces", [])

    for ip, dev in ospf_data.items():
        for nbr in dev.get("neighbors", []):
            nbr_rid   = nbr.get("router_id", "")
            nbr_if_ip = nbr.get("nbr_ip", "")
            nbr_name  = nbr.get("device_name", "")   # resolved in baseline (incl. fallbacks)
            state     = nbr.get("state", "")

            # P2P filter: skip neighbor unless it connects via a pointToPoint interface
            if p2p_only:
                local_p2p = p2p_ips.get(ip, set())
                if not any(_ips_in_same_p2p_subnet(lp, nbr_if_ip) for lp in local_p2p):
                    continue

            # Prefer matching by router_id; fall back to interface IP
            target = rid_to_ip.get(nbr_rid) or (
                nbr_if_ip if nbr_if_ip in ospf_data else None
            )

            if target is None:
                # Unknown external neighbor — use router_id or interface IP as node key
                target = nbr_rid or nbr_if_ip
                if not target:
                    continue
                if target not in G:
                    ext_vendor = _resolve_from_ip_map(
                        nbr_rid, ip_to_vendor or {}, "unknown",
                    ).lower()
                    if ext_vendor == "unknown" and nbr_if_ip:
                        ext_vendor = _resolve_from_ip_map(
                            nbr_if_ip, ip_to_vendor or {}, "unknown",
                        ).lower()
                    ext_type = _resolve_from_ip_map(nbr_rid, ip_to_type or {})
                    if not ext_type and nbr_if_ip:
                        ext_type = _resolve_from_ip_map(nbr_if_ip, ip_to_type or {})
                    G.add_node(
                        target,
                        label        = nbr_name or nbr_rid or nbr_if_ip,
                        vendor       = ext_vendor,
                        device_type  = ext_type,
                        router_id    = nbr_rid,
                        status       = "unknown",
                        node_type    = "external",
                        areas        = [],
                        n_interfaces = 0,
                        n_neighbors  = 0,
                        admin_status = "",
                        name_source  = nbr.get("name_source", ""),
                    )
                else:
                    # Upgrade label / vendor / type if a later sighting resolves them
                    if nbr_name and G.nodes[target].get("label") in ("", nbr_rid, nbr_if_ip):
                        G.nodes[target]["label"]       = nbr_name
                        G.nodes[target]["name_source"] = nbr.get("name_source", "")
                    if G.nodes[target].get("vendor") == "unknown" and ip_to_vendor:
                        v2 = _resolve_from_ip_map(nbr_rid, ip_to_vendor, "unknown").lower()
                        if v2 == "unknown" and nbr_if_ip:
                            v2 = _resolve_from_ip_map(nbr_if_ip, ip_to_vendor, "unknown").lower()
                        if v2 != "unknown":
                            G.nodes[target]["vendor"] = v2
                    if not G.nodes[target].get("device_type") and ip_to_type:
                        t2 = _resolve_from_ip_map(nbr_rid, ip_to_type)
                        if not t2 and nbr_if_ip:
                            t2 = _resolve_from_ip_map(nbr_if_ip, ip_to_type)
                        if t2:
                            G.nodes[target]["device_type"] = t2

            if target == ip:
                continue  # skip self-loops

            # Find the local interface facing this neighbor (same /30 or /31)
            local_if: Optional[dict] = None
            if nbr_if_ip:
                for iface in _dev_ifaces.get(ip, []):
                    lip = iface.get("if_ip", "")
                    if lip and _ips_in_same_p2p_subnet(lip, nbr_if_ip):
                        local_if = iface
                        break

            if G.has_edge(ip, target):
                # Keep the best-known state: "full" beats everything
                if state == "full":
                    G[ip][target]["state"] = state
                # Merge the other side's interface cost/mtu onto existing edge
                ed = G[ip][target]
                if local_if and not ed.get("dst_cost"):
                    ed["dst_cost"] = local_if.get("cost", "")
                    ed["dst_mtu"]  = local_if.get("mtu", "")
                    ed["dst_name"] = G.nodes[ip].get("label", ip)
            else:
                src_ip   = local_if.get("if_ip", "")   if local_if else ""
                src_cost = local_if.get("cost", "")     if local_if else ""
                src_mtu  = local_if.get("mtu", "")      if local_if else ""
                G.add_edge(
                    ip, target, state=state,
                    src_ip=src_ip, src_cost=src_cost, src_mtu=src_mtu,
                    src_name=G.nodes[ip].get("label", ip),
                    dst_ip=nbr_if_ip,
                    dst_cost="", dst_mtu="",
                    dst_name=G.nodes[target].get("label", target) if target in G.nodes else target,
                )

    # Remove isolated nodes when p2p filter is active (DR-only devices not useful)
    if p2p_only:
        isolated = [n for n in list(G.nodes) if G.degree(n) == 0]
        G.remove_nodes_from(isolated)

    return G


# ── Layout ────────────────────────────────────────────────────────────────────

def _compute_vis_positions(G: "nx.Graph") -> Dict[str, Tuple[float, float]]:
    """Compute 2-D positions via NetworkX; scale to vis.js coordinate space.

    Hub nodes (high degree) are seeded near centre for spring layouts so they
    remain central after stabilisation.  Leaf nodes (degree=1) are pulled close
    to their single neighbour after layout to avoid cluttering the canvas.
    """
    n = len(G.nodes)
    if n == 0:
        return {}
    if n == 1:
        return {list(G.nodes)[0]: (0.0, 0.0)}

    scale = max(420.0, 130.0 * math.sqrt(n))
    k     = scale / max(1.0, math.sqrt(n) * 3)

    # Seed hub nodes near centre so spring layout keeps them there
    initial_pos: Optional[dict] = None
    if n > 50:
        degrees = dict(G.degree())
        max_deg = max(degrees.values()) if degrees else 1
        if max_deg > 1:
            initial_pos = {}
            for node, deg in degrees.items():
                frac  = 1.0 - (deg / max_deg) ** 0.5  # 0 = hub → centre
                angle = (hash(str(node)) % 6283) / 1000.0
                r     = 0.1 + frac * 0.85
                initial_pos[node] = (r * math.cos(angle), r * math.sin(angle))

    try:
        if n <= 50:
            raw = nx.kamada_kawai_layout(G, scale=scale)
        elif n <= 150:
            raw = nx.spring_layout(G, seed=42, scale=scale, k=k,
                                   iterations=60, pos=initial_pos)
        else:
            raw = nx.spring_layout(G, seed=42, scale=scale, k=k,
                                   iterations=30, pos=initial_pos)
    except Exception:
        raw = nx.spring_layout(G, seed=42, scale=scale, iterations=30)

    # Pull leaf nodes (degree=1) close to their single neighbour to reduce clutter
    leaf_dist = scale * 0.13
    for node in list(G.nodes):
        if G.degree(node) == 1:
            parent   = next(iter(G.neighbors(node)))
            px, py   = raw[parent]
            lx, ly   = raw[node]
            dx, dy   = lx - px, ly - py
            dist     = math.sqrt(dx * dx + dy * dy) or 1.0
            raw[node] = (px + dx / dist * leaf_dist, py + dy / dist * leaf_dist)

    return {node: (float(x), float(y)) for node, (x, y) in raw.items()}


# ── vis.js data builders ──────────────────────────────────────────────────────

def _build_vis_nodes(
    G: "nx.Graph",
    positions: Dict[str, Tuple[float, float]],
) -> List[dict]:
    nodes: List[dict] = []
    for node_id in G.nodes:
        data    = G.nodes[node_id]
        vendor  = data.get("vendor", "unknown").lower()
        status  = data.get("status", "up")
        ntype   = data.get("node_type", "known")
        deg     = G.degree(node_id)

        # Colour — external nodes with a resolved vendor get their vendor color
        vc = _VENDOR_COLOR.get(vendor, _DEFAULT_COLOR)
        if status in ("down", "error"):
            bg, border = _DOWN_COLOR["bg"], "#EF4444"
        elif ntype == "external" and vendor == "unknown":
            bg, border = _EXTERNAL_COLOR["bg"], _EXTERNAL_COLOR["border"]
        else:
            bg, border = vc["bg"], vc["border"]

        color = {
            "background": bg,
            "border":     border,
            "highlight":  {"background": "#FDE68A", "border": "#F59E0B"},
            "hover":      {"background": "#BFDBFE", "border": "#3B82F6"},
        }

        # Size proportional to degree
        size = max(12 if ntype == "external" else 15, min(38, 15 + deg * 3))

        # Label (truncate)
        raw_label = data.get("label", node_id)
        label = raw_label if len(raw_label) <= 22 else raw_label[:19] + "…"

        x, y = positions.get(node_id, (0.0, 0.0))
        node: dict = {
            "id":          node_id,
            "label":       label,
            "color":       color,
            "size":        size,
            "x":           round(x, 2),
            "y":           round(y, 2),
            "font": {
                "color": "#CBD5E1" if ntype != "external" else "#82A5C0",
                "size":  20,
            },
            "borderWidth": 3 if status in ("down", "error") else 2,
            # Extra fields used by browser-side filters (not rendered by vis.js)
            "vendor":      vendor,
            "dtype":       data.get("device_type", ""),
            "is_leaf":     G.degree(node_id) == 1,
            "is_unnamed":  raw_label == node_id,   # True when only IP, no device name
            "degree":      deg,
            "mass":        max(1, min(10, deg)),
            "full_label":  raw_label,              # untruncated, used by doSearch()
        }
        nodes.append(node)
    return nodes


def _build_vis_edges(G: "nx.Graph") -> List[dict]:
    edges: List[dict] = []
    for i, (src, dst, data) in enumerate(G.edges(data=True)):
        state = data.get("state", "")
        if state == "full":
            color, width, dashes = _EDGE_FULL, 2, False
        elif state:
            color, width, dashes = _EDGE_PARTIAL, 1.5, [8, 4]
        else:
            color, width, dashes = _EDGE_UNKNOWN, 1, [6, 4]

        # Build tooltip with interface details from both sides
        tip_lines: List[str] = []
        s_name = data.get("src_name", "")
        s_ip   = data.get("src_ip", "")
        s_cost = data.get("src_cost", "")
        s_mtu  = data.get("src_mtu", "")
        d_name = data.get("dst_name", "")
        d_ip   = data.get("dst_ip", "")
        d_cost = data.get("dst_cost", "")
        d_mtu  = data.get("dst_mtu", "")

        def _side(name: str, ip: str, cost: str, mtu: str) -> str:
            parts = [f"  {name}"]
            if ip:
                parts.append(f"    IP: {ip}")
            if cost:
                parts.append(f"    Cost: {cost}")
            if mtu:
                parts.append(f"    MTU: {mtu}")
            return "\n".join(parts)

        if s_ip or s_cost or s_mtu:
            tip_lines.append(_side(s_name or src, s_ip, s_cost, s_mtu))
        if d_ip or d_cost or d_mtu:
            tip_lines.append(_side(d_name or dst, d_ip, d_cost, d_mtu))
        if state:
            tip_lines.append(f"  State: {state}")
        tooltip = "\n".join(tip_lines) if tip_lines else ""

        edge: dict = {
            "id":     f"e{i}",
            "from":   src,
            "to":     dst,
            "color":  color,
            "width":  width,
            "dashes": dashes,
        }
        if tooltip:
            edge["title"] = tooltip
        edges.append(edge)
    return edges


def _build_device_info(
    ospf_data: dict,
    G: "nx.Graph",
    rid_to_name: Dict[str, str],
    ip_to_vendor: Optional[Dict[str, str]] = None,
) -> dict:
    """Build device-info JSON used by the click-info panel in the browser."""
    info: dict = {}

    # router_id → management IP — needed so neighbor navigation resolves known
    # devices correctly (DI is keyed by management IP, not router_id).
    rid_to_ip = {
        dev.get("router_id", ""): ip
        for ip, dev in ospf_data.items()
        if dev.get("router_id")
    }

    # Known devices
    for ip, dev in ospf_data.items():
        nbrs = []
        for nbr in dev.get("neighbors", []):
            nbr_rid = nbr.get("router_id", "")
            nbr_ip_ = nbr.get("nbr_ip", "")
            # Prefer the name resolved in the baseline (Router-ID match or the
            # IP / Nokia-IP+1 fallbacks); fall back to the legacy rid lookup.
            nbr_name = nbr.get("device_name", "") or rid_to_name.get(nbr_rid, "")
            # Resolve the vis.js graph node key for this neighbor so the JS
            # info panel can navigate to it (DI is keyed by management IP for
            # known devices, by router_id or interface IP for external nodes).
            nbr_node_key = (
                rid_to_ip.get(nbr_rid)                          # known device
                or (nbr_rid if nbr_rid in G.nodes else "")      # external, rid is key
                or (nbr_ip_ if nbr_ip_ in G.nodes else "")      # external, ip is key
            )
            nbrs.append({
                "ip":          nbr_ip_,
                "rid":         nbr_rid,
                "name":        nbr_name,
                "name_source": nbr.get("name_source", ""),
                "state":       nbr.get("state", ""),
                "node_key":    nbr_node_key,
            })
        info[ip] = {
            "name":         dev.get("device_name") or ip,
            "ip":           ip,
            "vendor":       dev.get("vendor", "unknown"),
            "device_type":  G.nodes[ip].get("device_type", "") if ip in G.nodes else "",
            "router_id":    dev.get("router_id", ""),
            "admin_status": dev.get("admin_status", ""),
            "status":       "down" if dev.get("error") else "up",
            "error":        dev.get("error") or "",
            "areas":        sorted({
                a.strip()
                for i in dev.get("interfaces", [])
                for a in (i.get("area", "") or "").split(",")
                if a.strip()
            }),
            "interfaces": dev.get("interfaces", []),
            "neighbors":  nbrs,
            "node_type":  "known",
        }

    # External nodes (in graph but not in ospf_data)
    for node_id in G.nodes:
        if node_id in info:
            continue
        nd = G.nodes[node_id]
        ext_v = nd.get("vendor", "unknown")
        info[node_id] = {
            "name":         nd.get("label", node_id),
            "ip":           node_id,
            "vendor":       ext_v,
            "device_type":  nd.get("device_type", ""),
            "router_id":    nd.get("router_id", ""),
            "admin_status": "N/A",
            "status":       "unknown",
            "error":        "Not in managed device list" if ext_v == "unknown" else "",
            "areas":        [],
            "interfaces":   [],
            "neighbors":    [],
            "node_type":    "external",
        }

    return info


def _build_vendor_legend(G: "nx.Graph") -> str:
    # Include all nodes with a known vendor (both managed and external)
    seen = sorted({
        G.nodes[n].get("vendor", "unknown").lower()
        for n in G.nodes
        if G.nodes[n].get("vendor", "unknown").lower() != "unknown"
    })
    items: List[str] = []
    for vendor in seen:
        bg = _VENDOR_COLOR.get(vendor, _DEFAULT_COLOR)["bg"]
        label = _VENDOR_DISPLAY.get(vendor, vendor.capitalize())
        items.append(
            f'<div class="lg-item">'
            f'<span class="lg-dot" style="background:{bg}"></span>'
            f'<span>{label}</span></div>'
        )
    # "External / Unknown" entry: only if there are external nodes with unknown vendor
    has_unknown_ext = any(
        G.nodes[n].get("node_type") == "external"
        and G.nodes[n].get("vendor", "unknown").lower() == "unknown"
        for n in G.nodes
    )
    if has_unknown_ext:
        items.append(
            '<div class="lg-item">'
            '<span class="lg-dot" style="background:#1E3A5F;'
            'border:2px solid #2D5296"></span>'
            '<span>External / Unknown</span></div>'
        )
    has_unknown_known = any(
        G.nodes[n].get("vendor", "unknown").lower() == "unknown"
        and G.nodes[n].get("node_type") != "external"
        for n in G.nodes
    )
    if has_unknown_known:
        items.append(
            '<div class="lg-item">'
            f'<span class="lg-dot" style="background:{_DEFAULT_COLOR["bg"]}"></span>'
            '<span>Other</span></div>'
        )
    return "\n".join(items)


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_ospf_topology_html(
    ospf_data: dict,
    output_file: str,
    title: str = "",
    timestamp: str = "",
    p2p_only: bool = True,
    ip_to_vendor: Optional[Dict[str, str]] = None,
    ip_to_type: Optional[Dict[str, str]] = None,
) -> str:
    """Generate an interactive HTML topology from OSPF audit data.

    Requires networkx.  Writes a self-contained HTML file to *output_file*.
    The HTML loads vis-network from CDN (internet required when opening).
    When p2p_only=True (default), only pointToPoint OSPF interfaces are shown.
    *ip_to_vendor* maps device management IPs to vendor strings so external
    neighbor nodes are coloured by their actual vendor instead of "Other".
    *ip_to_type* maps device management IPs to device type strings for type filtering.
    Returns the output_file path.
    """
    _require_networkx()

    G = build_ospf_graph(ospf_data, p2p_only=p2p_only,
                         ip_to_vendor=ip_to_vendor, ip_to_type=ip_to_type)

    rid_to_name: Dict[str, str] = {
        dev.get("router_id", ""): dev.get("device_name", "")
        for dev in ospf_data.values()
        if dev.get("router_id") and dev.get("device_name")
    }

    positions   = _compute_vis_positions(G)
    vis_nodes   = _build_vis_nodes(G, positions)
    vis_edges   = _build_vis_edges(G)
    dev_info    = _build_device_info(ospf_data, G, rid_to_name, ip_to_vendor)
    vend_legend = _build_vendor_legend(G)

    n_nodes  = len(G.nodes)
    n_known  = sum(1 for n in G.nodes if G.nodes[n].get("node_type") == "known")
    n_ext    = sum(1 for n in G.nodes if G.nodes[n].get("node_type") == "external")
    n_down   = sum(1 for n in G.nodes if G.nodes[n].get("status") in ("down", "error"))
    gen_ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # For large networks disable browser physics (layout pre-computed by NetworkX)
    if n_nodes > 150:
        init_physics = "false"
        stab_iters   = "0"
    elif n_nodes > 80:
        init_physics = "true"
        stab_iters   = "80"
    else:
        init_physics = "true"
        stab_iters   = "200"

    vendors_in_graph = sorted({
        G.nodes[n].get("vendor", "unknown").lower()
        for n in G.nodes
    })
    types_in_graph = sorted({
        G.nodes[n].get("device_type", "") or ""
        for n in G.nodes
    })
    if "" in types_in_graph:
        types_in_graph.remove("")
        types_in_graph.append("")
    leaf_count    = sum(1 for n in G.nodes if G.degree(n) == 1)
    unnamed_count = sum(
        1 for n in G.nodes
        if (G.nodes[n].get("label", n) == n)
    )

    filter_note = " — P2P links" if p2p_only else ""
    display_title = (title or "") + filter_note

    html = _HTML_TEMPLATE
    html = html.replace("__TITLE__",            display_title or "OSPF Topology")
    html = html.replace("__TIMESTAMP__",        timestamp or gen_ts)
    html = html.replace("__N_NODES__",          str(n_known))
    html = html.replace("__N_EDGES__",          str(len(vis_edges)))
    html = html.replace("__N_DOWN__",           str(n_down))
    html = html.replace("__N_EXT__",            str(n_ext))
    html = html.replace("__DOWN_DISPLAY__",     "none" if n_down == 0 else "flex")
    html = html.replace("__INIT_PHYSICS__",     init_physics)
    html = html.replace("__STAB_ITERS__",       stab_iters)
    html = html.replace("__NODES_JSON__",       json.dumps(vis_nodes,  ensure_ascii=False))
    html = html.replace("__EDGES_JSON__",       json.dumps(vis_edges,  ensure_ascii=False))
    html = html.replace("__DEVICE_INFO_JSON__", json.dumps(dev_info,   ensure_ascii=False))
    html = html.replace("__VENDOR_LEGEND__",    vend_legend)
    html = html.replace("__GEN_TS__",           gen_ts)
    html = html.replace("__VENDORS_JSON__",     json.dumps(vendors_in_graph, ensure_ascii=False))
    html = html.replace("__TYPES_JSON__",       json.dumps(types_in_graph,   ensure_ascii=False))
    html = html.replace("__LEAF_COUNT__",       str(leaf_count))
    html = html.replace("__UNNAMED_COUNT__",    str(unnamed_count))

    out_dir = os.path.dirname(output_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as fh:
        fh.write(html)
    return output_file


# ── HTML template ─────────────────────────────────────────────────────────────

_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSPF Topology &ndash; __TITLE__</title>
  <script>
  (function(){
    var p="https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js";
    var q="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js";
    var s=document.createElement('script'); s.src=p;
    s.onerror=function(){
      var t=document.createElement('script'); t.src=q;
      t.onerror=function(){
        var el=document.getElementById('loading');
        if(el) el.innerHTML='<div style="color:#EF4444;padding:48px;text-align:center;font-size:14px">'
          +'<b>Cannot load vis.js</b><br><br>Internet connection is required.<br>'
          +'<button onclick="location.reload()" style="margin-top:14px;padding:7px 20px;'
          +'background:#1A6FE6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Retry</button></div>';
      };
      document.head.appendChild(t);
    };
    document.head.appendChild(s);
  })();
  </script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#07091A;--bg-p:rgba(6,10,28,.94);--bg-c:#0D1428;--bg-h:#162244;
      --bd:#1C3260;--bd2:#253E70;
      --t1:#DDE8F8;--t2:#94B3D0;--td:#7193B0;
      --ac:#1A6FE6;--acl:#4D94FF;
      --gr:#16A34A;--grl:#22C55E;
      --am:#D97706;--aml:#F59E0B;
      --re:#DC2626;--rel:#EF4444;
      --r:8px;--sh:0 4px 28px rgba(0,0,20,.55)
    }
    html,body{height:100%;overflow:hidden;background:var(--bg);
      font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--t1);font-size:13px}

    /* HEADER */
    #hdr{position:fixed;top:0;left:0;right:0;height:50px;z-index:200;
      display:flex;align-items:center;padding:0 14px;gap:10px;
      background:rgba(4,7,22,.97);border-bottom:1px solid var(--bd);backdrop-filter:blur(16px)}
    .hdr-logo{width:28px;height:28px;border-radius:7px;flex-shrink:0;background:var(--ac);
      display:flex;align-items:center;justify-content:center}
    .hdr-logo svg{width:17px;height:17px}
    .hdr-t{font-size:14px;font-weight:600;color:var(--t1);letter-spacing:.02em;white-space:nowrap}
    .hdr-s{font-size:11px;color:var(--t2);max-width:200px;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Search */
    .hdr-srch{position:relative;flex:0 0 auto}
    .hdr-srch input{background:rgba(255,255,255,.04);border:1px solid var(--bd);
      border-radius:20px;padding:4px 10px 4px 28px;color:var(--t1);
      font-size:12px;width:190px;outline:none;transition:border-color .15s,width .2s}
    .hdr-srch input:focus{border-color:var(--ac);width:240px}
    .hdr-srch input::placeholder{color:var(--td)}
    .hdr-srch-ic{position:absolute;left:9px;top:50%;transform:translateY(-50%);
      font-size:12px;color:var(--td);pointer-events:none}
    .hdr-sp{flex:1}
    .hdr-chips{display:flex;gap:7px;align-items:center}
    .chip{padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid transparent}
    .chip-b{color:#90C5FF;background:rgba(26,111,230,.12);border-color:rgba(26,111,230,.28)}
    .chip-g{color:#6EE7A0;background:rgba(22,163,74,.12);border-color:rgba(22,163,74,.28)}
    .chip-r{color:#FCA5A5;background:rgba(220,38,38,.12);border-color:rgba(220,38,38,.28)}
    .hdr-ts{font-size:11px;color:var(--t2);white-space:nowrap}

    /* CANVAS */
    #network{position:fixed;top:50px;left:0;right:0;bottom:0;
      background:radial-gradient(circle at 50% 40%,#0D1830 0%,#07091A 68%)}
    #network::before{content:'';position:absolute;inset:0;pointer-events:none;
      background-image:radial-gradient(circle,rgba(28,50,96,.35) 1px,transparent 1px);
      background-size:36px 36px}

    /* LOADING */
    #loading{position:fixed;inset:50px 0 0;z-index:50;display:flex;align-items:center;
      justify-content:center;background:#07091A;transition:opacity .4s}
    .ld-box{display:flex;flex-direction:column;align-items:center;gap:14px}
    .ld-spin{width:38px;height:38px;border-radius:50%;
      border:3px solid var(--bd);border-top-color:var(--ac);animation:spin .75s linear infinite}
    .ld-lbl{font-size:13px;color:var(--t2);letter-spacing:.05em}
    .ld-pct{font-size:11px;color:var(--td)}
    @keyframes spin{to{transform:rotate(360deg)}}

    /* PANELS */
    .panel{position:fixed;top:62px;background:var(--bg-p);border:1px solid var(--bd);
      border-radius:var(--r);backdrop-filter:blur(14px);box-shadow:var(--sh);overflow:hidden}
    .p-hdr{display:flex;align-items:center;justify-content:space-between;
      padding:9px 12px 8px;border-bottom:1px solid var(--bd)}
    .p-ttl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--t2)}
    .p-cls{width:22px;height:22px;border-radius:5px;border:none;background:transparent;
      color:var(--t2);cursor:pointer;font-size:16px;display:flex;align-items:center;
      justify-content:center;transition:background .15s}
    .p-cls:hover{background:var(--bg-h);color:var(--t1)}
    .p-body{padding:10px 12px;overflow-y:auto}

    /* LEGEND */
    #legend{left:12px;width:188px;max-height:calc(100vh - 76px)}
    .lg-sec{margin-bottom:11px}
    .lg-sec-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
      color:var(--td);margin-bottom:5px}
    .lg-item{display:flex;align-items:center;gap:7px;margin-bottom:4px;
      font-size:12px;color:var(--t2)}
    .lg-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .lg-line{width:22px;height:3px;border-radius:2px;flex-shrink:0}
    .lg-full{background:var(--gr)}
    .lg-part{background:repeating-linear-gradient(90deg,var(--am) 0 6px,transparent 6px 10px)}
    .lg-unk{background:repeating-linear-gradient(90deg,var(--td) 0 4px,transparent 4px 8px)}
    .s-row{display:flex;justify-content:space-between;align-items:center;
      padding:3px 0;font-size:12px}
    .s-val{font-weight:600;color:var(--t1);font-variant-numeric:tabular-nums}

    /* FILTER PANEL */
    #flt{left:212px;width:218px;max-height:calc(100vh - 76px);display:none}
    .flt-row{display:flex;align-items:center;gap:7px;padding:3px 2px;cursor:pointer;
      border-radius:4px;font-size:12px;color:var(--t2);line-height:1.4}
    .flt-row:hover{background:var(--bg-h)}
    .flt-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .flt-row input[type="checkbox"]{accent-color:var(--ac);cursor:pointer;flex-shrink:0}
    #flt-count{font-size:11px;color:var(--td);padding-top:6px;
      border-top:1px solid var(--bd);margin-top:6px}
    .flt-reset{margin-top:7px;width:100%;padding:5px 0;background:rgba(26,111,230,.1);
      border:1px solid rgba(26,111,230,.28);border-radius:5px;color:var(--acl);
      cursor:pointer;font-size:11px;font-weight:500;transition:background .15s}
    .flt-reset:hover{background:rgba(26,111,230,.2)}

    /* INFO PANEL */
    #info{right:12px;width:292px;max-height:calc(100vh - 76px);
      transform:translateX(320px);transition:transform .22s cubic-bezier(.4,0,.2,1)}
    #info.vis{transform:translateX(0)}
    .i-name{font-size:14px;font-weight:600;color:var(--t1);line-height:1.3}
    .i-dot{display:inline-block;width:8px;height:8px;border-radius:50%;
      margin-right:5px;vertical-align:middle}
    .i-row{display:flex;justify-content:space-between;align-items:baseline;
      padding:4px 0;border-bottom:1px solid rgba(28,50,96,.45);font-size:12px}
    .i-row:last-child{border-bottom:none}
    .i-k{color:var(--t2)}
    .i-v{color:var(--t1);font-weight:500;text-align:right;max-width:175px;word-break:break-all}
    .i-stl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
      color:var(--td);margin:9px 0 4px}
    .nbr{display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:5px;
      margin-bottom:3px;cursor:pointer;font-size:12px;transition:background .12s}
    .nbr:hover{background:var(--bg-h)}
    .ns{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600}
    .ns-f{background:rgba(22,163,74,.18);color:var(--grl)}
    .ns-p{background:rgba(217,119,6,.18);color:var(--aml)}
    .ns-o{background:rgba(28,50,96,.5);color:var(--t2)}
    .if-r{font-size:11px;color:var(--t2);padding:2px 0;
      font-family:'Cascadia Code','Consolas',monospace}
    .vbadge{display:inline-block;padding:2px 7px;border-radius:4px;
      font-size:11px;font-weight:500;border:1px solid transparent}
    .vb-cisco{color:#60A5FA;background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.3)}
    .vb-juniper{color:#4ADE80;background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3)}
    .vb-nokia,.vb-alcatel{color:#FB923C;background:rgba(249,115,22,.12);border-color:rgba(249,115,22,.3)}
    .vb-huawei{color:#F87171;background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3)}
    .vb-unknown{color:#94A3B8;background:rgba(100,116,139,.1);border-color:rgba(100,116,139,.25)}

    /* TOOLBAR */
    #tb{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);
      display:flex;align-items:center;gap:3px;
      background:var(--bg-p);border:1px solid var(--bd);border-radius:40px;
      padding:6px 12px;backdrop-filter:blur(14px);box-shadow:var(--sh);z-index:200}
    .tb{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;
      border:none;cursor:pointer;font-size:12px;font-weight:500;color:var(--t2);
      background:transparent;transition:background .15s,color .15s;white-space:nowrap}
    .tb:hover{background:var(--bg-h);color:var(--t1)}
    .tb.on{background:rgba(26,111,230,.16);color:var(--acl)}
    .tb-sep{width:1px;height:18px;background:var(--bd);margin:0 3px}
    .tb-ic{font-size:14px;line-height:1}

    /* VIS.JS EDGE TOOLTIP */
    div.vis-tooltip{background:var(--bg-p)!important;border:1px solid var(--bd)!important;
      border-radius:var(--r)!important;color:var(--t1)!important;font-size:12px!important;
      font-family:'Cascadia Code','Consolas',monospace!important;
      padding:8px 12px!important;white-space:pre!important;line-height:1.5!important;
      box-shadow:var(--sh)!important;pointer-events:none}

    /* SCROLLBAR */
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px}

    /* ── MOBILE RESPONSIVE ──────────────────────────────────────────────── */
    @media(max-width:768px){
      #hdr{height:44px;padding:0 8px;gap:6px}
      .hdr-logo{width:24px;height:24px;border-radius:5px}
      .hdr-logo svg{width:14px;height:14px}
      .hdr-t{font-size:13px}
      .hdr-s,.hdr-ts{display:none}
      .hdr-srch input{width:110px;padding:5px 8px 5px 26px}
      .hdr-srch input:focus{width:160px}
      .chip{padding:2px 6px;font-size:10px}
      #network{top:44px}
      #loading{inset:44px 0 0}
      .panel{top:auto!important;bottom:56px;left:6px!important;right:6px!important;
        width:auto!important;max-height:50vh!important;border-radius:12px;z-index:300}
      #legend{display:none}
      #info{z-index:310;transform:translateY(120%)!important;
        transition:transform .25s cubic-bezier(.4,0,.2,1)!important}
      #info.vis{transform:translateY(0)!important}
      .p-body{-webkit-overflow-scrolling:touch}
      #tb{bottom:6px;padding:4px 8px;gap:1px;border-radius:30px;
        max-width:calc(100vw - 12px);overflow-x:auto;scrollbar-width:none;
        -webkit-overflow-scrolling:touch}
      #tb::-webkit-scrollbar{display:none}
      .tb{padding:6px 8px;font-size:11px;gap:3px;flex-shrink:0}
      .tb-sep{margin:0 1px}
      .kb-hint{display:none}
      .tb,.p-cls,.flt-reset,.nbr{touch-action:manipulation}
      .flt-row{padding:7px 4px;min-height:36px}
      .flt-row input[type="checkbox"]{width:18px;height:18px}
      .nbr{padding:7px 6px;min-height:38px}
      .p-cls{width:28px;height:28px;font-size:18px}
    }
    @media(max-width:480px){
      #hdr{padding:0 6px;gap:4px}
      .hdr-t{font-size:12px;max-width:90px;overflow:hidden;text-overflow:ellipsis}
      .hdr-srch input{width:80px;font-size:11px}
      .hdr-srch input:focus{width:130px}
      .chip{padding:2px 5px;font-size:9px}
      .panel{max-height:55vh!important;bottom:52px}
      .i-v{max-width:55vw}
      .tb{padding:5px 6px;font-size:10px}
    }
    @media(max-height:500px){
      .panel{max-height:40vh!important}
    }
  </style>
</head>
<body>

<!-- HEADER -->
<div id="hdr">
  <div class="hdr-logo">
    <svg viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.8" fill="white"/>
      <line x1="10" y1="7.2" x2="10" y2="2"  stroke="white" stroke-width="1.7" stroke-linecap="round"/>
      <line x1="10" y1="12.8" x2="10" y2="18" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
      <line x1="7.2" y1="10" x2="2"  y2="10" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
      <line x1="12.8" y1="10" x2="18" y2="10" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="10" cy="2"  r="1.8" fill="white"/>
      <circle cx="10" cy="18" r="1.8" fill="white"/>
      <circle cx="2"  cy="10" r="1.8" fill="white"/>
      <circle cx="18" cy="10" r="1.8" fill="white"/>
    </svg>
  </div>
  <span class="hdr-t">OSPF Topology</span>
  <span class="hdr-s">__TITLE__</span>
  <div class="hdr-srch">
    <span class="hdr-srch-ic">&#128269;</span>
    <input id="srch" type="text" placeholder="Search device name / IP&hellip;"
      oninput="doSearch(this.value)" autocomplete="off">
  </div>
  <div class="hdr-sp"></div>
  <div class="hdr-chips">
    <span class="chip chip-b" id="chip-nodes">__N_NODES__ devices</span>
    <span class="chip chip-g" id="chip-links">__N_EDGES__ links</span>
    <span id="chip-dn" class="chip chip-r" style="display:__DOWN_DISPLAY__">__N_DOWN__ down</span>
  </div>
  <span class="hdr-ts">Captured: __TIMESTAMP__</span>
</div>

<!-- CANVAS -->
<div id="network"></div>

<!-- LOADING -->
<div id="loading">
  <div class="ld-box">
    <div class="ld-spin"></div>
    <div class="ld-lbl">Calculating layout&hellip;</div>
    <div class="ld-pct" id="ld-p">Initializing</div>
  </div>
</div>

<!-- LEGEND -->
<div id="legend" class="panel">
  <div class="p-hdr">
    <span class="p-ttl">Legend</span>
    <button class="p-cls" onclick="togLegend()" title="Collapse">&#8722;</button>
  </div>
  <div class="p-body" id="lg-body">
    <div class="lg-sec">
      <div class="lg-sec-t">Vendors</div>
      __VENDOR_LEGEND__
    </div>
    <div class="lg-sec">
      <div class="lg-sec-t">Link State</div>
      <div class="lg-item"><div class="lg-line lg-full"></div><span>OSPF Full</span></div>
      <div class="lg-item"><div class="lg-line lg-part"></div><span>Non-Full</span></div>
      <div class="lg-item"><div class="lg-line lg-unk"></div><span>Unknown</span></div>
    </div>
    <div class="lg-sec">
      <div class="lg-sec-t">Node Status</div>
      <div class="lg-item"><div class="lg-dot" style="background:#16A34A"></div><span>Reachable</span></div>
      <div class="lg-item"><div class="lg-dot" style="background:#374151;border:2px solid #EF4444"></div><span>Down / Error</span></div>
      <div class="lg-item"><div class="lg-dot" style="background:#1E3A5F;border:2px solid #2D5296"></div><span>External</span></div>
    </div>
    <div class="lg-sec">
      <div class="lg-sec-t">Statistics</div>
      <div class="s-row"><span>Known devices</span><span class="s-val" id="stat-nodes">__N_NODES__</span></div>
      <div class="s-row"><span>External nodes</span><span class="s-val">__N_EXT__</span></div>
      <div class="s-row"><span>OSPF links</span><span class="s-val" id="stat-links">__N_EDGES__</span></div>
      <div class="s-row"><span>Down / Error</span><span class="s-val">__N_DOWN__</span></div>
    </div>
    <div style="padding-top:6px;font-size:10px;color:var(--td);border-top:1px solid var(--bd)">
      Generated: __GEN_TS__
    </div>
  </div>
</div>

<!-- FILTER PANEL -->
<div id="flt" class="panel">
  <div class="p-hdr">
    <span class="p-ttl">Display Filter</span>
    <button class="p-cls" onclick="togFilter()" title="Close">&#215;</button>
  </div>
  <div class="p-body">
    <div class="lg-sec-t" style="margin-bottom:6px">Types</div>
    <div id="flt-types"></div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd)">
      <div class="lg-sec-t" style="margin-bottom:6px">Vendors</div>
      <div id="flt-vendors"></div>
    </div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd)">
      <label class="flt-row">
        <input type="checkbox" id="flt-leafs" onchange="applyFilter()">
        <span style="flex:1">Hide leaf nodes
          <span style="color:var(--td);font-size:10px">(__LEAF_COUNT__ total)</span>
        </span>
      </label>
      <label class="flt-row" style="margin-top:4px">
        <input type="checkbox" id="flt-unnamed" onchange="applyFilter()">
        <span style="flex:1">Hide unnamed (IP only)
          <span style="color:var(--td);font-size:10px">(__UNNAMED_COUNT__ total)</span>
        </span>
      </label>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd)">
      <div class="lg-sec-t" style="margin-bottom:5px">Area Highlight</div>
      <label class="flt-row">
        <input type="checkbox" id="flt-multiarea" onchange="togMultiAreaHL(this.checked)">
        <span style="flex:1">Highlight multi-area devices
          <span id="multiarea-cnt" style="color:var(--td);font-size:10px"></span>
        </span>
        <span class="flt-dot" style="background:transparent;border:2.5px solid #F59E0B;flex-shrink:0"></span>
      </label>
      <div style="font-size:10px;color:var(--td);margin-top:4px;line-height:1.5;padding-left:20px">
        Click any device to highlight<br>others in the same OSPF area
      </div>
    </div>
    <div id="flt-count"></div>
    <div style="display:flex;gap:6px;margin-top:7px">
      <button class="flt-reset" style="flex:1" onclick="resetFilter()"
        title="Reset filters — keeps current node positions">&#8635; Reset</button>
      <button class="flt-reset" style="flex:1;background:rgba(22,163,74,.08);
        border-color:rgba(22,163,74,.25);color:#6EE7A0" onclick="reloadFilter()"
        title="Show only filtered nodes at original positions (press Physics to reorganize)">&#9654; Reload</button>
    </div>
  </div>
</div>

<!-- INFO PANEL -->
<div id="info" class="panel">
  <div class="p-hdr">
    <span class="p-ttl" id="info-ttl">Device Info</span>
    <button class="p-cls" onclick="closeInfo()" title="Close (Esc)">&#215;</button>
  </div>
  <div class="p-body" id="info-body"></div>
</div>

<!-- TOOLBAR -->
<div id="tb">
  <button class="tb" onclick="fitView()" title="Fit all nodes (F)">
    <span class="tb-ic">&#10610;</span>Fit
  </button>
  <div class="tb-sep"></div>
  <button class="tb on" id="phys-btn" onclick="togPhys()" title="Toggle physics (P)">
    <span class="tb-ic">&#9678;</span>Physics
  </button>
  <div class="tb-sep"></div>
  <button class="tb" id="flt-btn" onclick="togFilter()" title="Display filters">
    <span class="tb-ic">&#9788;</span>Filter
  </button>
  <div class="tb-sep"></div>
  <button class="tb" onclick="expPNG()" title="Export current view as PNG (3× quality) — zoom to desired area first for best detail">
    <span class="tb-ic">&#8659;</span>PNG
  </button>
  <div class="tb-sep"></div>
  <button class="tb" onclick="saveState()" title="Save node positions (Ctrl+S) — auto-restored on next open">
    <span class="tb-ic">&#128190;</span>Save <span class="kb-hint" style="font-size:10px;opacity:.6">Ctrl+S</span>
  </button>
  <div class="tb-sep"></div>
  <button class="tb on" id="lgd-btn" onclick="togLegend()" title="Toggle legend">
    <span class="tb-ic">&#8801;</span>Legend
  </button>
</div>

<script>
// ── Immutable source data ─────────────────────────────────────────────────────
// Markers //\x40nd_end and //\x40vp_end are used by saveState() to patch saved HTML
const ALL_ND=__NODES_JSON__;//@nd_end
const _INIT_VP_=null;//@vp_end
const _INIT_FILTER_=null;//@flt_end
const ALL_ED  = __EDGES_JSON__;
const DI      = __DEVICE_INFO_JSON__;
const VENDORS = __VENDORS_JSON__;
const TYPES   = __TYPES_JSON__;

const VC = {
  cisco:{bg:'#3B82F6'},juniper:{bg:'#22C55E'},nokia:{bg:'#F97316'},
  alcatel:{bg:'#F97316'},huawei:{bg:'#EF4444'},external:{bg:'#1E3A5F'},unknown:{bg:'#64748B'}
};
const VD = {
  cisco:'Cisco',juniper:'Juniper',nokia:'Nokia',alcatel:'Nokia',
  huawei:'Huawei',external:'External',unknown:'Other'
};

let net, physOn=__INIT_PHYSICS__, lgdOn=true, fltOn=false;
let nodes, edges;
let activeVendors = new Set(VENDORS);
let activeTypes   = new Set(TYPES);

// ── Area highlight state ──────────────────────────────────────────────────────
let _areaHL = {active:false, matchIds:new Set()};
let _multiAreaHL = false;
// Nodes that belong to 2+ OSPF areas (computed once from DI).
// Handle both a proper list ["0.0.0.1","0.0.0.2"] and a legacy comma-joined
// single string ["0.0.0.1, 0.0.0.2"] (written by older saves).
var _multiAreaIds = new Set(
  Object.keys(DI).filter(function(id){
    var areas=(DI[id]||{}).areas||[];
    return areas.length>=2||(areas.length===1&&areas[0].indexOf(',')>=0);
  })
);

// Compute effective color/font/borderWidth for all nodes in DataSet,
// combining base color from ALL_ND with multi-area and area-click overlays.
function _nodeEffectiveUpdates(){
  var inDS=new Set(nodes.getIds());
  var updates=[];
  ALL_ND.forEach(function(nd){
    if(!inDS.has(nd.id)) return;
    var color=JSON.parse(JSON.stringify(nd.color));
    var bw=nd.borderWidth||2;
    var font=JSON.parse(JSON.stringify(nd.font||{}));
    // Multi-area ring (amber border) — applied first
    if(_multiAreaHL&&_multiAreaIds.has(nd.id)){
      color.border='#F59E0B';
      color.highlight={background:'#FDE68A',border:'#F59E0B'};
      bw=4;
    }
    // Area click-highlight: dim non-matching nodes (overrides multi-area on dim)
    if(_areaHL.active&&!_areaHL.matchIds.has(nd.id)){
      color.background='#131B2B';
      color.border='#1C2C42';
      font.color='#293D55';
      bw=1;
    }
    updates.push({id:nd.id, color:color, font:font, borderWidth:bw});
  });
  return updates;
}

// Dim edges whose both endpoints are not in the area match set.
function _edgeEffectiveUpdates(){
  var inDS=new Set(edges.getIds());
  var DIM_EDGE={color:'#1A2638',highlight:'#253E70',hover:'#253E70'};
  return ALL_ED.filter(function(e){return inDS.has(e.id);}).map(function(e){
    if(!_areaHL.active||(_areaHL.matchIds.has(e.from)&&_areaHL.matchIds.has(e.to)))
      return {id:e.id, color:e.color, width:e.width};
    return {id:e.id, color:DIM_EDGE, width:1};
  });
}

function applyAreaHighlight(clickedId){
  var clickedInfo=DI[clickedId];
  if(!clickedInfo) return;
  var clickedAreas=new Set(clickedInfo.areas||[]);
  if(clickedAreas.size===0){clearAreaHighlight();return;}
  // Only consider nodes currently visible (not hidden) in the DataSet
  var visIds=new Set(
    nodes.get({filter:function(n){return !n.hidden;}}).map(function(n){return n.id;})
  );
  var matchIds=new Set([clickedId]);
  ALL_ND.forEach(function(nd){
    if(!visIds.has(nd.id)) return;
    var ndAreas=(DI[nd.id]||{}).areas||[];
    if(ndAreas.some(function(a){return clickedAreas.has(a);})) matchIds.add(nd.id);
  });
  _areaHL={active:true,matchIds:matchIds};
  nodes.update(_nodeEffectiveUpdates());
  edges.update(_edgeEffectiveUpdates());
}

function clearAreaHighlight(){
  if(!_areaHL.active) return;
  _areaHL={active:false,matchIds:new Set()};
  nodes.update(_nodeEffectiveUpdates());
  edges.update(_edgeEffectiveUpdates());
}

function togMultiAreaHL(checked){
  _multiAreaHL=checked;
  nodes.update(_nodeEffectiveUpdates());
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, isErr){
  var t=document.getElementById('_toast');
  if(!t){
    t=document.createElement('div'); t.id='_toast';
    t.style.cssText='position:fixed;bottom:70px;left:50%;transform:translateX(-50%);'
      +'padding:7px 18px;background:rgba(10,16,38,.97);border:1px solid #1C3260;'
      +'border-radius:22px;font-size:12px;color:#DDE8F8;z-index:500;'
      +'pointer-events:none;transition:opacity .35s;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,20,.5)';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.borderColor=isErr?'#EF4444':'#1C3260';
  t.style.opacity='1';
  clearTimeout(t._to);
  t._to=setTimeout(function(){t.style.opacity='0';},2800);
}

// ── Save layout — bakes positions into HTML and downloads portable file ───────
function saveState(){
  if(!net) return;
  try {
    // Pass ALL_ND IDs explicitly so vis.js returns positions for hidden nodes too.
    // Without explicit IDs, getPositions() uses body.nodeIndices which excludes
    // hidden nodes — causing them to retain original NetworkX positions in the
    // saved file, which then scatters visible nodes when Physics is re-enabled.
    var pos=net.getPositions(ALL_ND.map(function(n){return n.id;}));
    var sc=net.getScale();
    var vp=net.getViewPosition();

    // Build updated node array with current positions
    var updNodes=ALL_ND.map(function(n){
      var p=pos[n.id]; if(!p) return n;
      var c={}; for(var k in n) c[k]=n[k];
      c.x=Math.round(p.x*10)/10; c.y=Math.round(p.y*10)/10;
      return c;
    });

    var h=document.documentElement.outerHTML;

    // Patch ALL_ND (//\x40nd_end marker)
    var ND_S='const ALL_ND=', ND_E=';//@nd_end';
    var si=h.indexOf(ND_S), ei=h.indexOf(ND_E,si);
    if(si>=0&&ei>si) h=h.slice(0,si+ND_S.length)+JSON.stringify(updNodes)+h.slice(ei);

    // Patch _INIT_VP_ (//\x40vp_end marker)
    var VP_S='const _INIT_VP_=', VP_E=';//@vp_end';
    var vi=h.indexOf(VP_S), ve=h.indexOf(VP_E,vi);
    if(vi>=0&&ve>vi) h=h.slice(0,vi+VP_S.length)+JSON.stringify({scale:sc,vp:vp})+h.slice(ve);

    // Ensure saved file initialises Physics button in OFF state (avoids flash)
    h=h.replace(/let net, physOn=(true|false),/,'let net, physOn=false,');

    // Patch _INIT_FILTER_ (//\x40flt_end marker) — preserve vendor/leaf/unnamed filter state
    var FLT_S='const _INIT_FILTER_=', FLT_E=';//@flt_end';
    var fsi=h.indexOf(FLT_S), fei=h.indexOf(FLT_E,fsi);
    if(fsi>=0&&fei>fsi){
      var _fltState={types:Array.from(activeTypes),
        vendors:Array.from(activeVendors),
        hideLeafs:(document.getElementById('flt-leafs')||{}).checked||false,
        hideUnnamed:(document.getElementById('flt-unnamed')||{}).checked||false,
        multiAreaHL:_multiAreaHL,
        // Track which nodes are currently in the DataSet. After reloadFilter()
        // some nodes are removed — saving their IDs lets the saved file re-init
        // with only this subset, preventing stale-position nodes from scattering
        // visible nodes when Physics is enabled.
        activeIds:nodes.getIds()};
      h=h.slice(0,fsi+FLT_S.length)+JSON.stringify(_fltState)+h.slice(fei);
    }

    var fname=(window.location.pathname.split('/').pop()||'ospf_topology.html')
              .replace(/(_saved)?\.html$/i,'_saved.html');
    var blob=new Blob([h],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a');
    a.download=fname; a.href=URL.createObjectURL(blob);
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    showToast('Downloaded: '+fname+' ✔');
  } catch(e){ showToast('Save failed: '+e.message,true); }
}

// ── Filter panel ──────────────────────────────────────────────────────────────
// Empty type is stored as '' — display as "Untyped"
var _UNTYPED='Untyped';
function _typeLabel(t){return t||_UNTYPED;}

function buildFilterPanel(){
  // Types section — checkboxes with a <span class="flt-cnt"> for dynamic counts
  var th='';
  TYPES.forEach(function(t){
    th+='<label class="flt-row" data-flt-type="'+t+'">'
      +'<input type="checkbox" checked data-dtype="'+t+'" onchange="togType(this)">'
      +'<span style="flex:1">'+esc(_typeLabel(t))
      +'<span class="flt-cnt" data-cnt-type="'+t+'" style="color:var(--td);margin-left:4px;font-size:10px"></span></span>'
      +'</label>';
  });
  var te=document.getElementById('flt-types');
  if(te) te.innerHTML=th;

  // Vendors section
  var html='';
  VENDORS.forEach(function(v){
    var col=(VC[v]||{bg:'#64748B'}).bg;
    var lbl=VD[v]||(v.charAt(0).toUpperCase()+v.slice(1));
    html+='<label class="flt-row" data-flt-vendor="'+v+'">'
      +'<input type="checkbox" checked data-vendor="'+v+'" onchange="togVendor(this)">'
      +'<span class="flt-dot" style="background:'+col+'"></span>'
      +'<span style="flex:1">'+lbl
      +'<span class="flt-cnt" data-cnt-vendor="'+v+'" style="color:var(--td);margin-left:4px;font-size:10px"></span></span>'
      +'</label>';
  });
  var el=document.getElementById('flt-vendors');
  if(el) el.innerHTML=html;
  var mc=document.getElementById('multiarea-cnt');
  if(mc) mc.textContent='('+_multiAreaIds.size+' devices)';
  _updateCrossCounts();
  updateFltCount(ALL_ND.length, ALL_ED.length);
}

// Cross-filter counts: each facet's count reflects the OTHER facet's selection.
// Type counts = nodes matching that type AND any active vendor.
// Vendor counts = nodes matching that vendor AND any active type.
// Rows with count=0 are dimmed (but remain checkable so user can re-enable).
function _updateCrossCounts(){
  // Vendor counts (filtered by active types)
  VENDORS.forEach(function(v){
    var cnt=ALL_ND.filter(function(n){return n.vendor===v&&activeTypes.has(n.dtype||'');}).length;
    var sp=document.querySelector('[data-cnt-vendor="'+v+'"]');
    if(sp) sp.textContent=cnt;
    var row=document.querySelector('[data-flt-vendor="'+v+'"]');
    if(row) row.style.opacity=cnt>0?'1':'0.35';
  });
  // Type counts (filtered by active vendors)
  TYPES.forEach(function(t){
    var cnt=ALL_ND.filter(function(n){return (n.dtype||'')===t&&activeVendors.has(n.vendor||'unknown');}).length;
    var sp=document.querySelector('[data-cnt-type="'+t+'"]');
    if(sp) sp.textContent=cnt;
    var row=document.querySelector('[data-flt-type="'+t+'"]');
    if(row) row.style.opacity=cnt>0?'1':'0.35';
  });
}

function togType(cb){
  var t=cb.getAttribute('data-dtype');
  if(cb.checked) activeTypes.add(t); else activeTypes.delete(t);
  applyFilter();
}

function togVendor(cb){
  var v=cb.getAttribute('data-vendor');
  if(cb.checked) activeVendors.add(v); else activeVendors.delete(v);
  applyFilter();
}

// Shared predicate: does this node pass both type AND vendor filters?
function _nodePassesFilter(n){
  var v=n.vendor||'unknown';
  var t=n.dtype||'';
  return activeTypes.has(t)&&activeVendors.has(v);
}

// applyFilter: hide/show in-place — NEVER destroys positions or triggers re-layout
function applyFilter(){
  if(!nodes||!edges) return;
  var hideLeafs   = (document.getElementById('flt-leafs')  ||{}).checked||false;
  var hideUnnamed = (document.getElementById('flt-unnamed')||{}).checked||false;

  _updateCrossCounts();

  var nodeUpd=ALL_ND.map(function(n){
    var hide=!_nodePassesFilter(n)||(hideLeafs&&n.is_leaf)||(hideUnnamed&&n.is_unnamed);
    return {id:n.id, hidden:hide};
  });
  var hiddenIds=new Set(nodeUpd.filter(function(n){return n.hidden;}).map(function(n){return n.id;}));
  var edgeUpd=ALL_ED.map(function(e){
    return {id:e.id, hidden:hiddenIds.has(e.from)||hiddenIds.has(e.to)};
  });

  nodes.update(nodeUpd);
  edges.update(edgeUpd);

  var vn=nodeUpd.filter(function(n){return !n.hidden;}).length;
  var ve=edgeUpd.filter(function(e){return !e.hidden;}).length;
  updateFltCount(vn, ve);
}

// reloadFilter: rebuild DataSet with only filtered nodes at original NetworkX positions.
// Instant — no scatter, no stabilization. User presses Physics to reorganize if desired.
function reloadFilter(){
  if(!nodes||!edges) return;
  var hideLeafs   = (document.getElementById('flt-leafs')  ||{}).checked||false;
  var hideUnnamed = (document.getElementById('flt-unnamed')||{}).checked||false;
  var filtered=ALL_ND.filter(function(n){
    if(!_nodePassesFilter(n)) return false;
    if(hideLeafs&&n.is_leaf) return false;
    if(hideUnnamed&&n.is_unnamed) return false;
    return true;
  });
  var ids=new Set(filtered.map(function(n){return n.id;}));
  var fe=ALL_ED.filter(function(e){return ids.has(e.from)&&ids.has(e.to);});
  if(net) net.unselectAll();
  closeInfo();
  _areaHL={active:false,matchIds:new Set()};

  nodes.clear(); nodes.add(filtered);
  edges.clear(); edges.add(fe);
  // Re-apply persistent overlays after DataSet rebuild
  if(_multiAreaHL) nodes.update(_nodeEffectiveUpdates());
  updateFltCount(filtered.length, fe.length);

  net.setOptions({physics:{enabled:false}});
  physOn=false;
  var b=document.getElementById('phys-btn');
  if(b){b.innerHTML='<span class="tb-ic">&#9711;</span>Physics';b.className='tb';}

  net.fit({animation:{duration:500,easingFunction:'easeInOutQuad'}});
  showToast('Showing '+filtered.length+' nodes — press Physics to reorganize');
}

function resetFilter(){
  activeTypes=new Set(TYPES);
  activeVendors=new Set(VENDORS);
  document.querySelectorAll('[data-dtype]').forEach(function(cb){cb.checked=true;});
  document.querySelectorAll('[data-vendor]').forEach(function(cb){cb.checked=true;});
  var lf=document.getElementById('flt-leafs');    if(lf) lf.checked=false;
  var un=document.getElementById('flt-unnamed'); if(un) un.checked=false;
  applyFilter();
}

function updateFltCount(n, e){
  var el=document.getElementById('flt-count'); if(!el) return;
  el.textContent='Showing '+n+' nodes, '+e+' links';
  var cn=document.getElementById('chip-nodes'), cl=document.getElementById('chip-links');
  var sn=document.getElementById('stat-nodes'), sl=document.getElementById('stat-links');
  if(cn) cn.textContent=n+' devices';
  if(cl) cl.textContent=e+' links';
  if(sn) sn.textContent=n;
  if(sl) sl.textContent=e;
}

function togFilter(){
  fltOn=!fltOn;
  if(fltOn&&window.innerWidth<=768&&lgdOn) togLegend();
  var p=document.getElementById('flt'); if(p) p.style.display=fltOn?'block':'none';
  var b=document.getElementById('flt-btn'); if(b) b.className='tb'+(fltOn?' on':'');
}

// ── Search ────────────────────────────────────────────────────────────────────
function doSearch(q){
  if(!net) return;
  q=q.trim(); if(!q){net.unselectAll();return;}
  var ql=q.toLowerCase(), matches=[];
  // Only search nodes currently visible in the DataSet (handles both applyFilter hidden
  // nodes and reloadFilter which removes nodes entirely from the DataSet).
  var visibleIds=new Set(nodes.get({filter:function(n){return !n.hidden;}}).map(function(n){return n.id;}));
  ALL_ND.forEach(function(n){
    if(!visibleIds.has(n.id)) return;
    // Search against full_label (untruncated) so long device names are found correctly.
    if((n.full_label||n.label||'').toLowerCase().includes(ql)||String(n.id||'').toLowerCase().includes(ql))
      matches.push(n.id);
  });
  net.unselectAll();
  if(!matches.length){showToast('No device found: "'+q+'"');return;}
  net.selectNodes(matches);
  if(matches.length===1){
    net.focus(matches[0],{scale:1.5,animation:{duration:500,easingFunction:'easeInOutQuad'}});
    showInfo(matches[0]);
  } else {
    net.fit({nodes:matches,animation:{duration:500,easingFunction:'easeInOutQuad'}});
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load',function(){
  if(typeof vis==='undefined'){
    var el=document.getElementById('loading');
    if(el) el.innerHTML='<div style="color:#EF4444;padding:48px;text-align:center;font-size:14px">'
      +'<b>vis.js failed to load.</b><br>Internet connection required.<br>'
      +'<button onclick="location.reload()" style="margin-top:14px;padding:7px 20px;'
      +'background:#1A6FE6;color:#fff;border:none;border-radius:6px;cursor:pointer">Retry</button></div>';
    return;
  }

  buildFilterPanel();

  var c=document.getElementById('network');
  // Saved file: if reloadFilter was active at save time, _INIT_FILTER_.activeIds
  // contains only the nodes that were in the DataSet. Init with that subset so
  // removed nodes (which have stale NetworkX positions in ALL_ND) are never added
  // back — they would scatter visible nodes when Physics is enabled.
  var _initNd=ALL_ND, _initEd=ALL_ED;
  if(_INIT_VP_!==null&&_INIT_FILTER_!==null&&_INIT_FILTER_.activeIds){
    var _aSet=new Set(_INIT_FILTER_.activeIds);
    _initNd=ALL_ND.filter(function(n){return _aSet.has(n.id);});
    _initEd=ALL_ED.filter(function(e){return _aSet.has(e.from)&&_aSet.has(e.to);});
  }
  nodes=new vis.DataSet(_initNd);
  edges=new vis.DataSet(_initEd);

  var opts={
    physics:{
      enabled:__INIT_PHYSICS__, solver:'barnesHut',
      barnesHut:{gravitationalConstant:-7000,centralGravity:.12,springLength:170,
                 springConstant:.03,damping:.13,avoidOverlap:.7},
      maxVelocity:50,minVelocity:.5,
      stabilization:{enabled:(__STAB_ITERS__>0),iterations:__STAB_ITERS__,updateInterval:30,fit:true}
    },
    interaction:{hover:true,tooltipDelay:180,dragNodes:true,dragView:true,
                 zoomView:true,multiselect:false,navigationButtons:false,keyboard:false},
    nodes:{shape:'dot',font:{face:"'Segoe UI',system-ui,sans-serif"},
           borderWidth:2,borderWidthSelected:4,
           shadow:{enabled:true,color:'rgba(0,0,20,.4)',size:6,x:0,y:2},
           scaling:{label:{drawThreshold:8,maxVisible:40}}},
    edges:{smooth:{type:'continuous',roundness:.15},shadow:false},
    layout:{improvedLayout:false,randomSeed:42}
  };

  // Saved file: keep physics ENABLED at construction (no stabilization, no fit)
  // so vis.js seeds physics bodies from the baked-in node positions.
  // We call stopSimulation() immediately after — before any animation frame fires —
  // so nodes never actually move. Without this, physics bodies are never initialised
  // and clicking Physics later triggers a full re-layout from scratch.
  if(_INIT_VP_!==null){
    opts.physics.enabled=true;
    opts.physics.stabilization={enabled:false,fit:false};
  }
  net=new vis.Network(c,{nodes:nodes,edges:edges},opts);

  function _syncPhysBtn(){
    var pb=document.getElementById('phys-btn');
    if(!pb) return;
    pb.innerHTML='<span class="tb-ic">'+(physOn?'&#9678;':'&#9711;')+'</span>Physics';
    pb.className='tb'+(physOn?' on':'');
  }
  _syncPhysBtn();

  function _hideLoading(){
    var ld=document.getElementById('loading');
    if(ld){ld.style.opacity='0';setTimeout(function(){ld.style.display='none'},350);}
  }

  // Saved file: stop simulation before first frame, then lock physics off.
  // Physics bodies are already seeded at baked positions (see construction above).
  if(_INIT_VP_!==null){
    // Restore filter state from saved file before showing the network
    if(_INIT_FILTER_!==null){
      if(_INIT_FILTER_.types){
        activeTypes=new Set(_INIT_FILTER_.types);
        document.querySelectorAll('[data-dtype]').forEach(function(cb){
          cb.checked=activeTypes.has(cb.getAttribute('data-dtype'));
        });
      }
      activeVendors=new Set(_INIT_FILTER_.vendors);
      document.querySelectorAll('[data-vendor]').forEach(function(cb){
        cb.checked=activeVendors.has(cb.getAttribute('data-vendor'));
      });
      var _lf=document.getElementById('flt-leafs');
      if(_lf) _lf.checked=_INIT_FILTER_.hideLeafs||false;
      var _un=document.getElementById('flt-unnamed');
      if(_un) _un.checked=_INIT_FILTER_.hideUnnamed||false;
      applyFilter();
      if(_INIT_FILTER_.multiAreaHL){
        _multiAreaHL=true;
        var _ma=document.getElementById('flt-multiarea');
        if(_ma) _ma.checked=true;
        nodes.update(_nodeEffectiveUpdates());
      }
    }
    net.stopSimulation();
    net.setOptions({physics:{enabled:false}});
    physOn=false; _syncPhysBtn();
    setTimeout(function(){
      _hideLoading();
      net.moveTo({position:_INIT_VP_.vp,scale:_INIT_VP_.scale,
                  animation:{duration:400,easingFunction:'easeInOutQuad'}});
    },300);
  } else {
    // Original file: run stabilization (small/medium) or timeout (large)
    function _afterStabilize(){
      net.stopSimulation();
      net.setOptions({physics:{enabled:false}});
      physOn=false; _syncPhysBtn();
      // Update node positions to their final stabilized values in-place.
      // nodes.update() zeroes physicsBody.velocities for each node — sufficient
      // for clean physics restarts — without destroying the DataSet, which would
      // corrupt vis.js interaction handler state and break zoom/pan/drag.
      var fp=net.getPositions();
      // Only update nodes currently in the DataSet — prevents re-adding nodes
      // that were removed by reloadFilter() if stabilization fires after a reload.
      var _existIds=new Set(nodes.getIds());
      var clean=ALL_ND.filter(function(n){return _existIds.has(n.id);}).map(function(n){
        var p=fp[n.id]; if(!p) return n;
        var c={}; for(var k in n) c[k]=n[k];
        c.x=Math.round(p.x*10)/10; c.y=Math.round(p.y*10)/10;
        return c;
      });
      nodes.update(clean);
      _hideLoading();
      net.fit({animation:{duration:600,easingFunction:'easeInOutQuad'}});
    }
    net.on('stabilizationProgress',function(p){
      var el=document.getElementById('ld-p');
      if(el) el.textContent=Math.round(p.iterations/p.total*100)+'%';
    });
    // once() — _afterStabilize runs only for initial stabilization, not on every
    // subsequent physics stop triggered by vis.js minVelocity threshold (avoids auto-stop after togPhys)
    net.once('stabilized',_afterStabilize);
    if(!__INIT_PHYSICS__){
      setTimeout(function(){
        _hideLoading();
        net.fit({animation:{duration:600,easingFunction:'easeInOutQuad'}});
      },800);
    }
  }

  net.on('selectNode',function(p){
    if(p.nodes.length){showInfo(p.nodes[0]);applyAreaHighlight(p.nodes[0]);}
  });
  net.on('deselectNode',function(){closeInfo();});
  net.on('doubleClick',function(p){
    if(p.nodes.length) net.focus(p.nodes[0],{scale:1.5,animation:{duration:500}});
  });

  // Mobile: auto-hide legend (shown by default on desktop), sync toolbar state
  if(window.innerWidth<=768){
    lgdOn=false;
    var _lg=document.getElementById('legend'); if(_lg) _lg.style.display='none';
    var _lgb=document.getElementById('lgd-btn'); if(_lgb) _lgb.className='tb';
  }
});

// ── Info Panel ────────────────────────────────────────────────────────────────
function showInfo(id){
  var d=DI[id]; if(!d) return;
  document.getElementById('info-ttl').textContent=
    d.node_type==='external'?'External Node':'Device Info';

  var v=(d.vendor||'unknown').toLowerCase();
  var isExt=d.node_type==='external';
  var sc=d.status==='up'?'#16A34A':(isExt?'#94A3B8':'#EF4444');

  var h='<div style="margin-bottom:10px">'
    +'<span class="i-dot" style="background:'+sc+'"></span>'
    +'<span class="i-name">'+esc(d.name)+'</span>';
  if(v!=='unknown'){
    h+='&nbsp;<span class="vbadge vb-'+v+'">'+esc(v.charAt(0).toUpperCase()+v.slice(1))+'</span>';
  }
  h+='</div><div>';
  h+=ir('Management IP',d.ip);
  if(d.device_type) h+=ir('Type',esc(d.device_type));
  if(d.router_id) h+=ir('Router ID',d.router_id);
  if(!isExt){
    h+=ir('OSPF Admin',d.admin_status||'N/A');
    if(d.status!=='up') h+=ir('Status','<span style="color:#EF4444">'+(d.error||'DOWN')+'</span>');
  } else {
    h+=ir('Status','<span style="color:#94A3B8">Not monitored</span>');
  }
  if(d.areas&&d.areas.length) h+=ir('OSPF Areas',d.areas.join(', '));
  h+='</div>';

  if(d.neighbors&&d.neighbors.length){
    h+='<div class="i-stl">Neighbors ('+d.neighbors.length+')</div>';
    d.neighbors.forEach(function(nbr){
      var sc2=nbr.state==='full'?'ns-f':(nbr.state?'ns-p':'ns-o');
      var lbl=nbr.name||nbr.rid||nbr.ip;
      var src=nbr.name_source?' <span style="font-size:9px;color:#94B3D0">['+esc(nbr.name_source)+']</span>':'';
      var tgt=nbr.node_key&&DI[nbr.node_key]?nbr.node_key:null;
      var clk=tgt?'onclick="foc(\''+esc(tgt)+'\')"':'';
      h+='<div class="nbr" '+clk+'>'
        +'<span class="ns '+sc2+'">'+(nbr.state||'?')+'</span>'
        +'<span style="flex:1;color:#C9D8F0">'+esc(lbl)+src+'</span>'
        +'<span style="font-size:10px;color:#7193B0">'+esc(nbr.ip)+'</span>'
        +'</div>';
    });
  }

  if(d.interfaces&&d.interfaces.length){
    var show=Math.min(d.interfaces.length,8);
    h+='<div class="i-stl">OSPF Interfaces ('+d.interfaces.length+')</div>';
    d.interfaces.slice(0,show).forEach(function(iface){
      var st=iface.if_state||'';
      var stc=st==='down'?'#EF4444':'#6EE7A0';
      h+='<div class="if-r"><span style="color:'+stc+'">&#9679;</span> '
        +esc(iface.if_ip)
        +(iface.area?' <span style="color:#7193B0">area:'+esc(iface.area)+'</span>':'')
        +(st?' <span style="color:#82A5C0">'+esc(st)+'</span>':'')
        +(iface.cost?' <span style="color:#7193B0">cost:'+esc(iface.cost)+'</span>':'')
        +(iface.mtu?' <span style="color:#7193B0">mtu:'+esc(iface.mtu)+'</span>':'')
        +'</div>';
    });
    if(d.interfaces.length>show)
      h+='<div style="font-size:10px;color:var(--td);margin-top:2px">…and '
        +(d.interfaces.length-show)+' more</div>';
  }

  document.getElementById('info-body').innerHTML=h;
  document.getElementById('info').classList.add('vis');
}

function ir(k,v){
  return '<div class="i-row"><span class="i-k">'+k+'</span><span class="i-v">'+v+'</span></div>';
}
function closeInfo(){
  document.getElementById('info').classList.remove('vis');
  if(net) net.unselectAll();
  clearAreaHighlight();
}
function foc(id){
  if(!net) return;
  net.selectNodes([id]);
  net.focus(id,{scale:1.25,animation:{duration:500}});
  showInfo(id);
  applyAreaHighlight(id);
}

// ── Controls ──────────────────────────────────────────────────────────────────
function fitView(){if(net) net.fit({animation:{duration:600,easingFunction:'easeInOutQuad'}});}

function togPhys(){
  if(!net) return;
  physOn=!physOn;
  if(physOn){
    // Reset velocity state before starting simulation by pushing current positions
    // back into the DataSet. Explicit ID list includes hidden nodes so their
    // physics bodies are also correctly seeded — if hidden nodes kept stale
    // positions their spring forces would scatter visible nodes on restart.
    var _allIds=nodes.getIds();
    var cp=net.getPositions(_allIds);
    nodes.update(_allIds.map(function(id){
      var p=cp[id]; if(!p) return {id:id};
      return {id:id, x:Math.round(p.x*10)/10, y:Math.round(p.y*10)/10};
    }));
    net.setOptions({physics:{
      enabled:true, solver:'barnesHut',
      stabilization:{enabled:false},
      // Same position-determining params as initial stabilization so equilibrium is
      // identical — Physics button starts from near-equilibrium and converges instantly
      // regardless of whether the file was saved before or after running Physics.
      // Only damping is higher (.28 vs .13) for smoother interactive feel.
      barnesHut:{gravitationalConstant:-7000,centralGravity:.12,springLength:170,
                 springConstant:.03,damping:.28,avoidOverlap:.7},
      maxVelocity:30, minVelocity:1.0
    }});
    net.startSimulation();
  } else {
    net.stopSimulation();
    net.setOptions({physics:{enabled:false}});
    // Force a redraw so the canvas event handlers remain active after physics is disabled.
    // Without this, vis.js leaves the canvas in a frozen state where zoom/pan/drag stop working.
    setTimeout(function(){ if(net) net.redraw(); }, 50);
  }
  var b=document.getElementById('phys-btn');
  b.innerHTML='<span class="tb-ic">'+(physOn?'&#9678;':'&#9711;')+'</span>Physics';
  b.className='tb'+(physOn?' on':'');
}

function togLegend(){
  lgdOn=!lgdOn;
  if(lgdOn&&window.innerWidth<=768&&fltOn) togFilter();
  var b=document.getElementById('lg-body'),l=document.getElementById('legend');
  var tb=document.getElementById('lgd-btn');
  if(window.innerWidth<=768){
    l.style.display=lgdOn?'block':'none';
    tb.className='tb'+(lgdOn?' on':'');
  } else {
    if(lgdOn){b.style.display='';l.querySelector('.p-cls').textContent='−';tb.classList.add('on');}
    else{b.style.display='none';l.querySelector('.p-cls').textContent='+';tb.classList.remove('on');}
  }
}

function expPNG(){
  if(!net) return;
  try{
    var cv=document.querySelector('#network canvas');
    if(!cv){showToast('Canvas not found',true);return;}
    // Use clientWidth/clientHeight (CSS pixels) to avoid double-scaling on HiDPI displays.
    // drawImage with explicit dw/dh handles the scaling correctly regardless of canvas buffer size.
    var W=cv.clientWidth, H=cv.clientHeight, sc=3;
    var oc=document.createElement('canvas');
    oc.width=W*sc; oc.height=H*sc;
    var ctx=oc.getContext('2d');
    ctx.fillStyle='#07091A';
    ctx.fillRect(0,0,oc.width,oc.height);
    ctx.drawImage(cv,0,0,W*sc,H*sc);
    var a=document.createElement('a');
    a.download='ospf_topology.png';
    a.href=oc.toDataURL('image/png');
    a.click();
    showToast('PNG exported ✔');
  }catch(e){showToast('PNG export failed: '+e.message,true);}
}

function esc(s){
  if(s==null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

document.addEventListener('keydown',function(e){
  var inInput=e.target.tagName==='INPUT';
  if(e.key==='Escape') closeInfo();
  if(!inInput&&(e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey) fitView();
  if(!inInput&&(e.key==='p'||e.key==='P')&&!e.ctrlKey&&!e.metaKey) togPhys();
  if((e.key==='s'||e.key==='S')&&(e.ctrlKey||e.metaKey)){e.preventDefault();saveState();}
});
</script>
</body>
</html>
"""
