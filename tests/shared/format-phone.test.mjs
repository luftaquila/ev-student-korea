import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, displayPhone, isMobilePhone } from "../../shared/format-phone.js";

describe("formatPhone (입력 중 실시간 포매팅)", () => {
  it("자릿수에 따라 하이픈을 넣는다", () => {
    assert.equal(formatPhone("01"), "01");
    assert.equal(formatPhone("010"), "010");
    assert.equal(formatPhone("0101"), "010-1");
    assert.equal(formatPhone("0101234"), "010-1234");
    assert.equal(formatPhone("01012345"), "010-1234-5");
    assert.equal(formatPhone("01012345678"), "010-1234-5678");
  });

  it("숫자가 아닌 문자는 버리고 11자리를 넘기지 않는다", () => {
    assert.equal(formatPhone("010-1234-5678"), "010-1234-5678", "이미 포맷된 값도 그대로 유지된다");
    assert.equal(formatPhone("010 1234 5678"), "010-1234-5678");
    assert.equal(formatPhone("010abc12345678999"), "010-1234-5678");
  });

  it("빈 값·null을 안전하게 처리한다", () => {
    assert.equal(formatPhone(""), "");
    assert.equal(formatPhone(null), "");
    assert.equal(formatPhone(undefined), "");
  });

  it("10자리 번호(011 등)도 포맷한다", () => {
    assert.equal(formatPhone("0111234567"), "011-1234-567");
  });
});

describe("displayPhone (저장값 표시)", () => {
  it("숫자만 저장된 값을 하이픈 포맷으로 보여준다", () => {
    assert.equal(displayPhone("01012345678"), "010-1234-5678");
    assert.equal(displayPhone("0111234567"), "011-1234-567");
  });

  it("빈 값은 빈 문자열", () => {
    assert.equal(displayPhone(""), "");
    assert.equal(displayPhone(null), "");
  });
});

describe("isMobilePhone (서버와 같은 기준)", () => {
  it("국내 휴대전화 번호를 통과시킨다", () => {
    assert.equal(isMobilePhone("010-1234-5678"), true);
    assert.equal(isMobilePhone("01012345678"), true);
    assert.equal(isMobilePhone("011-123-4567"), true);
  });

  it("형식이 아니면 거부한다", () => {
    assert.equal(isMobilePhone("02-123-4567"), false, "지역번호");
    assert.equal(isMobilePhone("010-123"), false, "자릿수 부족");
    assert.equal(isMobilePhone("015-1234-5678"), false, "없는 국번");
    assert.equal(isMobilePhone(""), false);
  });
});
