import config from "../../config";

// @ts-ignore because leaked-handles doesn't ship type defintions
import * as leaked from "leaked-handles";
leaked.set({ debugSockets: true });

import {
  IWithinRangeIntegerTag,
  IWithinRangeNumberTag
} from "italia-ts-commons/lib/numbers";
import { WithinRangeIntegerTest } from "../../generated/testapi/WithinRangeIntegerTest";
import { WithinRangeNumberTest } from "../../generated/testapi/WithinRangeNumberTest";
import { WithinRangeStringTest } from "../../generated/testapi/WithinRangeStringTest";
import { WithinRangeString } from "italia-ts-commons/lib/strings";

const { generatedFilesDir, isSpecEnabled } = config.specs.testapi;

// if there's no need for this suite in this particular run, just skip it
const describeSuite = isSpecEnabled ? describe : describe.skip;

const loadModule = (name: string) =>
  import(`${generatedFilesDir}/${name}.ts`).then(mod => {
    if (!mod) {
      fail(`Cannot load module ${generatedFilesDir}/${name}.ts`);
    }
    return mod;
  });

describe("FiscalCode definition", () => {
  it("should generate FiscalCode decoder", async () => {
    const { FiscalCode } = await loadModule("FiscalCode");
    expect(FiscalCode).toBeDefined();
  });

  it.each`
    title                                | example               | expected
    ${"should fail decoding empty"}      | ${""}                 | ${false}
    ${"should decode valid cf"}          | ${"RSSMRA80A01F205X"} | ${true}
    ${"should fail decoding invalid cf"} | ${"INVALIDCFFORMAT"}  | ${false}
  `("$title", async ({ example, expected }) => {
    const { FiscalCode } = await loadModule("FiscalCode");
    const result = FiscalCode.decode(example).isRight();
    expect(result).toEqual(expected);
  });
});

describe("Profile defintion", () => {
  it("should generate Profile decoder", async () => {
    const { Profile } = await loadModule("Profile");
    expect(Profile).toBeDefined();
  });

  const basicProfile = {
    family_name: "Rossi",
    fiscal_code: "RSSMRA80A01F205X",
    has_profile: true,
    is_email_set: false,
    name: "Mario",
    version: 123
  };
  const completeProfile = {
    family_name: "Rossi",
    fiscal_code: "RSSMRA80A01F205X",
    has_profile: true,
    is_email_set: false,
    name: "Mario",
    version: 123,
    email: "fake@email.com"
  };
  const profileWithPayload = {
    family_name: "Rossi",
    fiscal_code: "RSSMRA80A01F205X",
    has_profile: true,
    is_email_set: false,
    name: "Mario",
    version: 123,
    payload: { foo: "bar" }
  };

  it.each`
    title                                   | example               | expected
    ${"should fail decoding empty"}         | ${""}                 | ${false}
    ${"should fail decoding non-object"}    | ${"value"}            | ${false}
    ${"should decode basic profile"}        | ${basicProfile}       | ${true}
    ${"should decode complete profile"}     | ${completeProfile}    | ${true}
    ${"should decode profile with payload"} | ${profileWithPayload} | ${true}
  `("$title", async ({ example, expected }) => {
    const { Profile } = await loadModule("Profile");
    const result = Profile.decode(example).isRight();
    expect(result).toEqual(expected);
  });
});

describe("WithinRangeIntegerTest defintion", () => {
  //WithinRangeIntegerTest is defined min=0 max=10 in the spec
  it.each`
    value        | expected
    ${0}         | ${true /* lower bound */}
    ${-1}        | ${false}
    ${5}         | ${true}
    ${9.9999}    | ${false /* not an integer */}
    ${10}        | ${true /* upper bound */}
    ${10.0001}   | ${false /* not an integer */}
    ${11}        | ${false}
    ${100}       | ${false}
    ${undefined} | ${false}
  `(
    "should decode $value with WithinRangeIntegerTest",
    ({ value, expected }) => {
      const result = WithinRangeIntegerTest.decode(value);
      expect(result.isRight()).toEqual(expected);
      if (result.isRight()) {
        // check type definition
        const _: IWithinRangeIntegerTag<0, 11> = result.value;
      }
    }
  );
});

describe("WithinRangeNumberTest defintion", () => {
  //WithinRangeNumberTest is defined min=0 max=10 in the spec
  it.each`
    value        | expected
    ${0}         | ${true /* lower bound */}
    ${-1}        | ${false}
    ${5}         | ${true}
    ${9.9999999} | ${true}
    ${10}        | ${true /* upper bound */}
    ${10.000001} | ${false}
    ${11}        | ${false}
    ${100}       | ${false}
    ${undefined} | ${false}
  `(
    "should decode $value with WithinRangeNumberTest",
    ({ value, expected }) => {
      const result = WithinRangeNumberTest.decode(value);
      expect(result.isRight()).toEqual(expected);
      if (result.isRight()) {
        // check type definition
        const _: IWithinRangeNumberTag<0, 11> = result.value;
      }
    }
  );
});

describe("WithinRangeStringTest defintion", () => {
  //WithinRangeStringTest is defined min=8 max=10 in the spec
  it.each`
    value             | expected
    ${"a".repeat(7)}  | ${false}
    ${"a".repeat(8)}  | ${true /* lower bound */}
    ${"a".repeat(9)}  | ${true}
    ${"a".repeat(10)} | ${true /* upper bound */}
    ${"a".repeat(11)} | ${false}
    ${undefined}      | ${false}
  `(
    "should decode $value with WithinRangeStringTest",
    ({ value, expected }) => {
      const result = WithinRangeStringTest.decode(value);
      expect(result.isRight()).toEqual(expected);
      if (result.isRight()) {
        // check type definition
        const _: WithinRangeString<8, 11> = result.value;
      }
    }
  );
});
