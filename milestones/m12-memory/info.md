# M12 memory and frame workload

Goal: reduce retained memory and avoidable frame/input work while preserving accepted geometry, camera, sky and planting. Adjust hover lift and non-Bobst brightness as requested.

Scope: shared hover geometry, exact context attribute compaction, material reuse, static local matrices, cached/coalesced picking, bounded runtime diagnostics, primary-source research.

Status: source/resource implementation independently accepted. Geometry buffers reduced24.75%; memory5/5,presentation16/16,input12/12,camera20/20 pass. Acceptance requires exact geometry/component preservation, ownership-safe disposal and input/camera tests. Browser smoothness, GPU memory and visual acceptance remain pending access; do not equate offline bytes with browser heap or FPS.
