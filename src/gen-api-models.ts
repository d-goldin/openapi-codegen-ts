// tslint:disable:no-console

import * as fs from "fs-extra";
import { ITuple2, Tuple2 } from "italia-ts-commons/lib/tuples";
import * as nunjucks from "nunjucks";
import * as prettier from "prettier";
import * as SwaggerParser from "swagger-parser";
import { Operation, Schema, Spec } from "swagger-schema-official";

const SUPPORTED_SPEC_METHODS = ["get", "post", "put", "delete"];

function renderAsync(
  env: nunjucks.Environment,
  definition: Schema,
  definitionName: string,
  strictInterfaces: boolean
): Promise<string> {
  return new Promise((accept, reject) => {
    env.render(
      "model.ts.njk",
      {
        definition,
        definitionName,
        strictInterfaces
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        accept(res);
      }
    );
  });
}

export async function renderDefinitionCode(
  env: nunjucks.Environment,
  definitionName: string,
  definition: Schema,
  strictInterfaces: boolean
): Promise<string> {
  const code = await renderAsync(
    env,
    definition,
    definitionName,
    strictInterfaces
  );
  const prettifiedCode = prettier.format(code, {
    parser: "typescript"
  });
  return prettifiedCode;
}

function capitalize(s: string): string {
  return `${s[0].toUpperCase()}${s.slice(1)}`;
}

function uncapitalize(s: string): string {
  return `${s[0].toLowerCase()}${s.slice(1)}`;
}

function typeFromRef(s: string): string | undefined {
  const parts = s.split("/");
  return parts && parts.length > 0 ? parts[parts.length - 1] : undefined;
}

export function renderOperation(
  method: string,
  operationId: string,
  operation: Operation
): ITuple2<string, ReadonlySet<string>> {
  const requestType = `r.I${capitalize(method)}ApiRequestType`;
  const params: { [key: string]: string } = {};
  const importedTypes = new Set<string>();
  if (operation.parameters !== undefined) {
    operation.parameters.forEach(param => {
      const refInParam: string | undefined =
        (param as any).$ref ||
        ((param as any).schema ? (param as any).schema.$ref : undefined);
      if (refInParam === undefined) {
        console.warn(
          `Skipping param without ref in operation [${operationId}] [${
            param.name
          }]`
        );
        return;
      }
      const paramType = typeFromRef(refInParam);
      if (paramType === undefined) {
        console.warn(`Cannot extract type from ref [${refInParam}]`);
        return;
      }
      params[uncapitalize(paramType)] = paramType;
      importedTypes.add(paramType);
    });
  }

  const paramsCode = Object.keys(params)
    .map(paramKey => `${paramKey}: ${params[paramKey]}`)
    .join(",");

  const responses = Object.keys(operation.responses).map(responseKey => {
    const response = operation.responses[responseKey];
    const typeRef = response.schema ? response.schema.$ref : undefined;
    const responseType = typeRef ? typeFromRef(typeRef) : undefined;
    if (responseType !== undefined) {
      importedTypes.add(responseType);
    }
    return `r.IResponseType<${responseKey}, ${responseType || "undefined"}>`;
  });

  const code = `
    export type ${capitalize(
      operationId
    )}T = ${requestType}<{${paramsCode}}, never, never, ${responses.join("|")}>;
  `;

  return Tuple2(code, importedTypes);
}

export async function generateApi(
  env: nunjucks.Environment,
  specFilePath: string | Spec,
  definitionsDirPath: string,
  tsSpecFilePath: string | undefined,
  strictInterfaces: boolean,
  generateRequestTypes: boolean
): Promise<void> {
  const api: Spec = await SwaggerParser.bundle(specFilePath);

  const specCode = `
    /* tslint:disable:object-literal-sort-keys */
    /* tslint:disable:no-duplicate-string */

    // DO NOT EDIT
    // auto-generated by generated_model.ts from ${specFilePath}

    export const specs = ${JSON.stringify(api)};
  `;
  if (tsSpecFilePath) {
    console.log(`Writing TS Specs to ${tsSpecFilePath}`);
    await fs.writeFile(
      tsSpecFilePath,
      prettier.format(specCode, {
        parser: "typescript"
      })
    );
  }

  const definitions = api.definitions;
  if (!definitions) {
    console.log("No definitions found, skipping generation of model code.");
    return;
  }

  for (const definitionName in definitions) {
    if (definitions.hasOwnProperty(definitionName)) {
      const definition = definitions[definitionName];
      const outPath = `${definitionsDirPath}/${definitionName}.ts`;
      console.log(`${definitionName} -> ${outPath}`);
      const code = await renderDefinitionCode(
        env,
        definitionName,
        definition,
        strictInterfaces
      );
      await fs.writeFile(outPath, code);
    }
  }

  if (generateRequestTypes) {
    const operationsTypes = Object.keys(api.paths).map(path => {
      const pathSpec = api.paths[path];
      return Object.keys(pathSpec).map(operationKey => {
        const method = operationKey.toLowerCase();
        if (SUPPORTED_SPEC_METHODS.indexOf(method) < 0) {
          // skip unsupported spec methods
          return;
        }
        const operation =
          method === "get"
            ? pathSpec.get
            : method === "post"
              ? pathSpec.post
              : method === "put"
                ? pathSpec.put
                : method === "head"
                  ? pathSpec.head
                  : method === "delete"
                    ? pathSpec.delete
                    : undefined;
        if (operation === undefined) {
          console.warn(`Skipping unsupported method [${method}]`);
          return;
        }
        const operationId = operation.operationId;
        if (operationId === undefined) {
          console.warn(`Skipping method with missing operationId [${method}]`);
          return;
        }

        return renderOperation(method, operationId, operation);
      });
    });

    const operationsImports = new Set<string>();
    const operationTypesCode = operationsTypes
      .map(ops =>
        ops
          .map(op => {
            if (op === undefined) {
              return;
            }
            op.e2.forEach(i => operationsImports.add(i));
            return op.e1;
          })
          .join("\n")
      )
      .join("\n");

    const operationsCode = `
      import * as r from "italia-ts-commons/lib/requests";

      ${Array.from(operationsImports.values())
        .map(i => `import { ${i} } from "./${i}";`)
        .join("\n\n")}

      ${operationTypesCode}
    `;

    const prettifiedOperationsCode = prettier.format(operationsCode, {
      parser: "typescript"
    });

    const requestTypesPath = `${definitionsDirPath}/requestTypes.ts`;

    console.log(`Generating request types -> ${requestTypesPath}`);
    await fs.writeFile(requestTypesPath, prettifiedOperationsCode);
  }
}

//
// Configure nunjucks
//

export function initNunJucksEnvironment(): nunjucks.Environment {
  nunjucks.configure({
    trimBlocks: true
  });
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(`${__dirname}/../templates`)
  );

  env.addFilter("contains", <T>(a: ReadonlyArray<T>, item: T) => {
    return a.indexOf(item) !== -1;
  });
  env.addFilter("startsWith", <T>(a: string, item: string) => {
    return a.indexOf(item) === 0;
  });
  env.addFilter("capitalizeFirst", (item: string) => {
    return `${item[0].toUpperCase()}${item.slice(1)}`;
  });

  env.addFilter("comment", (item: string) => {
    return "/**\n * " + item.split("\n").join("\n * ") + "\n */";
  });

  env.addFilter("camelCase", (item: string) => {
    return item.replace(/(\_\w)/g, (m: string) => {
      return m[1].toUpperCase();
    });
  });

  let imports: { [key: string]: true } = {};
  env.addFilter("resetImports", (item: string) => {
    imports = {};
  });
  env.addFilter("addImport", (item: string) => {
    imports[item] = true;
  });
  env.addFilter("getImports", (item: string) => {
    return Object.keys(imports).join("\n");
  });

  let typeAliases: { [key: string]: true } = {};
  env.addFilter("resetTypeAliases", (item: string) => {
    typeAliases = {};
  });
  env.addFilter("addTypeAlias", (item: string) => {
    typeAliases[item] = true;
  });
  env.addFilter("getTypeAliases", (item: string) => {
    return Object.keys(typeAliases).join("\n");
  });

  return env;
}
