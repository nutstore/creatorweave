// 오류 경계
export const errorBoundary = {
    renderError: "렌더링 오류",
    componentRenderError:
      "컴포넌트 렌더링 중 오류가 발생했습니다. 일시적인 문제일 수 있으므로 페이지를 새로 고쳐주세요.",
    errorDetails: "오류 상세",
    retry: "재시도",
    streamingError: "스트리밍 출력 오류",
} as const
