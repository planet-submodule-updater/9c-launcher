import React, { useCallback, useState } from "react";
import { styled } from "src/v2/stitches.config";

const BareInputWrapper = styled("span", {
  position: "relative",
});

const BareInputStyled = styled("input", {
  appearance: "none",
  all: "unset",
  position: "absolute",
  width: "100%",
  left: 0,
});

function BareInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
  ref: React.Ref<HTMLInputElement>
) {
  const [value, setValue] = useState(props.value || "");
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(e);
      setValue(e.target.value);
    },
    [props.onChange]
  );

  return (
    <BareInputWrapper>
      <span aria-hidden>{value}</span>
      <BareInputStyled ref={ref} value={value} {...props} onChange={onChange} />
    </BareInputWrapper>
  );
}

export default React.forwardRef(BareInput);
