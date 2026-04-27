with open('/home/ubuntu/qloop/client/src/pages/DocumentDetail.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 753번 줄 (0-indexed: 752) 앞에 삽입 - "  if (isLoading) {" 줄 앞
insert_at = None
for i, line in enumerate(lines):
    if line.strip() == 'if (isLoading) {' and i > 700:
        insert_at = i
        break

if insert_at is None:
    print("ERROR: could not find insertion point")
else:
    new_lines = [
        '  // 개념 맵 노드에서 직접 학습 시작 (토픽 매핑 없이 노드 자체를 토픽으로 사용)\n',
        '  const handleStartFromNode = async (nodeLabel: string, nodeDescription: string) => {\n',
        '    if (!doc || starting) return;\n',
        '    setStarting(true);\n',
        '    try {\n',
        '      const nodeId = `concept-${nodeLabel.replace(/\\s+/g, \'-\').toLowerCase()}-${Date.now()}`;\n',
        '      const { sessionId } = await startSession.mutateAsync({\n',
        '        documentId: docId,\n',
        '        topicId: nodeId,\n',
        '        topicTitle: nodeLabel,\n',
        '        topicDescription: nodeDescription || nodeLabel,\n',
        '      });\n',
        '      navigate(`/sessions/${sessionId}`);\n',
        '    } catch (e: unknown) {\n',
        '      toast.error(e instanceof Error ? e.message : "세션 시작 실패");\n',
        '      setStarting(false);\n',
        '    }\n',
        '  };\n',
        '\n',
    ]
    lines = lines[:insert_at] + new_lines + lines[insert_at:]
    with open('/home/ubuntu/qloop/client/src/pages/DocumentDetail.tsx', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(f"Inserted handleStartFromNode before line {insert_at + 1}")
