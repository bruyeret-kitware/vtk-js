/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */

import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/OpenGL/Glyph3DMapper';
import '@kitware/vtk.js/Rendering/Misc/RenderingAPIs';
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import { throttle } from '@kitware/vtk.js/macros';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkPolydata from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import { mat4 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import { Representation } from '@kitware/vtk.js/Rendering/Core/Property/Constants';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

// Force the loading of HttpDataAccessHelper to support gzip decompression
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const WHITE = [1, 1, 1];
const GREEN = [0.1, 0.8, 0.1];

// ----------------------------------------------------------------------------
// Create DOM tooltip
// ----------------------------------------------------------------------------

const tooltipsElem = document.createElement('div');
tooltipsElem.style.position = 'absolute';
tooltipsElem.style.top = 0;
tooltipsElem.style.left = 0;
tooltipsElem.style.padding = '10px';
tooltipsElem.style.zIndex = 1;
tooltipsElem.style.background = 'white';
tooltipsElem.style.textAlign = 'center';

const positionTooltipElem = document.createElement('div');
const fieldIdTooltipElem = document.createElement('div');
const compositeIdTooltipElem = document.createElement('div');
const propIdTooltipElem = document.createElement('div');
tooltipsElem.appendChild(positionTooltipElem);
tooltipsElem.appendChild(propIdTooltipElem);
tooltipsElem.appendChild(fieldIdTooltipElem);
tooltipsElem.appendChild(compositeIdTooltipElem);

document.body.removeChild(document.querySelector('.content'));
document.body.appendChild(tooltipsElem);

// ----------------------------------------------------------------------------
// Create 4 objects
// - sphere
// - sphere rendered as big points (square)
// - cone
// - cylinder with sphere as point (glyph mapper: source=cylinder, glyph=sphere)
// ----------------------------------------------------------------------------

// Sphere -------------------------------------------------

const sphereSource = vtkSphereSource.newInstance({
  phiResolution: 30,
  thetaResolution: 30,
});

const sphereMapper = vtkMapper.newInstance();
const sphereActor = vtkActor.newInstance();
sphereActor.setMapper(sphereMapper);
sphereActor.getProperty().setEdgeVisibility(true);
sphereMapper.setInputConnection(sphereSource.getOutputPort());

// Cube -------------------------------------------------

const cubeSource = vtkCubeSource.newInstance({
  xLength: 1,
  yLength: 1,
  zLength: 1,
});

const cubeMapper = vtkMapper.newInstance();
const cubeActor = vtkActor.newInstance({ position: [-1, 0, 0] });
cubeActor.setMapper(cubeMapper);
cubeActor.getProperty().setEdgeVisibility(true);
cubeMapper.setInputConnection(cubeSource.getOutputPort());

// Sphere with point representation -----------------------

const spherePointsSource = vtkSphereSource.newInstance({
  phiResolution: 15,
  thetaResolution: 15,
  radius: 0.6,
});
const spherePointsMapper = vtkMapper.newInstance();
const spherePointsActor = vtkActor.newInstance({ position: [0, -1, 0] });
spherePointsActor.setMapper(spherePointsMapper);
spherePointsMapper.setInputConnection(spherePointsSource.getOutputPort());

// Use point representation
spherePointsActor.getProperty().setRepresentation(Representation.POINTS);
spherePointsActor.getProperty().setPointSize(20);

// Cone ---------------------------------------------------

const coneSource = vtkConeSource.newInstance({ resolution: 20 });
const coneMapper = vtkMapper.newInstance();
const coneActor = vtkActor.newInstance({ position: [1, 0, 0] });
coneActor.setMapper(coneMapper);
coneMapper.setInputConnection(coneSource.getOutputPort());

// Cylinder -----------------------------------------------

const cylinderSource = vtkCylinderSource.newInstance({
  resolution: 10,
  radius: 0.4,
  height: 0.6,
  direction: [1.0, 0.0, 0.0],
});
const cylinderMapper = vtkGlyph3DMapper.newInstance({
  scaling: true,
  scaleFactor: 0.25,
  scaleMode: vtkGlyph3DMapper.ScaleModes.SCALE_BY_MAGNITUDE,
  scaleArray: 'scale',
});
const cylinderActor = vtkActor.newInstance({ position: [0, 1, 0] });
const cylinderGlyph = sphereSource.getOutputData();
const cylinderPointSet = cylinderSource.getOutputData();
cylinderActor.setMapper(cylinderMapper);
cylinderMapper.setInputData(cylinderPointSet, 0);
cylinderMapper.setInputData(cylinderGlyph, 1);

// Add fields to cylinderPointSet
const scaleArray = new Float32Array(cylinderPointSet.getNumberOfPoints());
scaleArray.fill(0.5);
cylinderPointSet.getPointData().addArray(
  vtkDataArray.newInstance({
    name: 'scale',
    values: scaleArray,
  })
);

// PolyLines -------------------------------------------------

const polyLinesMapper = vtkMapper.newInstance();
const polyLinesData = vtkPolydata.newInstance();
const squarePoints = [-1, 2, 0, 0, 2, 0, 0, 1, 0, -1, 1, 0];
const trianglePoints = [1, 2, 0, 1, 1, 0, 2, 1.5, 0];
polyLinesData
  .getPoints()
  .setData(Float32Array.from([...squarePoints, ...trianglePoints]), 3);
polyLinesData
  .getLines()
  .setData(Uint16Array.from([5, 0, 1, 2, 3, 0, 4, 4, 5, 6, 4]));
polyLinesMapper.setInputData(polyLinesData);

const polyLines = vtkActor.newInstance();
polyLines.setMapper(polyLinesMapper);

// An actor made of 3 cells: a vertex, a line and triangle -------------------------------------------------

const multiPrimitiveMapper = vtkMapper.newInstance();
const multiPrimitiveData = vtkPolydata.newInstance();
const multiPrimitivePoints = [
  1, 0.75, 0, 2, 1, 0, 2, 0.75, 0, 1.5, 1, 0, 1, 0.5, 0, 2, 0.5, 0,
];
multiPrimitiveData
  .getPoints()
  .setData(Float32Array.from(multiPrimitivePoints), 3);
multiPrimitiveData.getVerts().setData(Uint16Array.from([1, 0]));
multiPrimitiveData.getLines().setData(Uint16Array.from([2, 1, 2]));
multiPrimitiveData.getPolys().setData(Uint16Array.from([3, 3, 4, 5]));
multiPrimitiveMapper.setInputData(multiPrimitiveData);

const multiPrimitive = vtkActor.newInstance();
multiPrimitive.setMapper(multiPrimitiveMapper);

// ----------------------------------------------------------------------------
// Create Picking pointer
// ----------------------------------------------------------------------------

const pointerSource = vtkSphereSource.newInstance({
  phiResolution: 15,
  thetaResolution: 15,
  radius: 0.01,
});
const pointerMapper = vtkMapper.newInstance();
const pointerActor = vtkActor.newInstance();
pointerActor.setMapper(pointerMapper);
pointerMapper.setInputConnection(pointerSource.getOutputPort());

// ----------------------------------------------------------------------------
// Create rendering infrastructure
// ----------------------------------------------------------------------------

const bodyStyle = document.body.style;
bodyStyle.height = '100vh';
bodyStyle.width = '100vw';
bodyStyle.margin = '0';
bodyStyle.display = 'flex';
bodyStyle['justify-content'] = 'space-around';
bodyStyle['align-items'] = 'center';
bodyStyle['flex-wrap'] = 'wrap';

const background = [0.32, 0.34, 0.43];

const mainRenderWindow = vtkRenderWindow.newInstance();
const mainView = mainRenderWindow.newAPISpecificView();
mainRenderWindow.addView(mainView);

function buildChildRenderWindow() {
  // Create child render window and the corresponding view
  const renderWindow = vtkRenderWindow.newInstance();
  mainRenderWindow.addRenderWindow(renderWindow);
  const view = mainView.addMissingNode(renderWindow);

  // Create container for the new render window
  const container = document.createElement('div');
  container.style.height = `50vh`;
  container.style.width = `50vw`;
  document.body.appendChild(container);
  view.setContainer(container);

  // Set size and css style
  const containerBounds = container.getBoundingClientRect();
  view.setSize(
    containerBounds.width * devicePixelRatio,
    containerBounds.height * devicePixelRatio
  );

  // Create renderer
  const renderer = vtkRenderer.newInstance({ background });
  renderWindow.addRenderer(renderer);

  // Create interactor
  const interactor = vtkRenderWindowInteractor.newInstance();
  interactor.setView(view);
  interactor.initialize();
  interactor.bindEvents(view.getCanvas());
  interactor.setInteractorStyle(
    vtkInteractorStyleTrackballCamera.newInstance()
  );

  // Create hardware selector
  const hardwareSelector = view.getSelector();
  hardwareSelector.setCaptureZValues(true);
  // TODO: bug in FIELD_ASSOCIATION_POINTS mode
  // hardwareSelector.setFieldAssociation(
  //   FieldAssociations.FIELD_ASSOCIATION_POINTS
  // );
  hardwareSelector.setFieldAssociation(
    FieldAssociations.FIELD_ASSOCIATION_CELLS
  );

  return { renderWindow, view, renderer, interactor, hardwareSelector };
}

// Initialize the main view before the first "render" that uses a child render windows
// You can alternatively render using the main render window (will render to all views)
// We initialize before building the child render windows because the interactor calls "render" on them
mainView.initialize();

const renderingObjects = [];
for (let i = 0; i < 64; ++i) {
  renderingObjects.push(buildChildRenderWindow());
}

// Resize the context, now that all the windows are set
mainView.resizeFromChildRenderWindows();

renderingObjects[0].renderer.addActor(sphereActor);
renderingObjects[0].renderer.addActor(cubeActor);
renderingObjects[0].renderer.addActor(spherePointsActor);
renderingObjects[0].renderer.addActor(coneActor);
renderingObjects[0].renderer.addActor(cylinderActor);

renderingObjects[1].renderer.addActor(polyLines);
renderingObjects[1].renderer.addActor(multiPrimitive);

renderingObjects.forEach(({ renderer, renderWindow }) => {
  renderer.addActor(pointerActor);
  renderer.resetCamera();
  renderWindow.render();
});

async function loadVolume() {
  const actor = vtkVolume.newInstance();
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setSampleDistance(0.7);
  mapper.setVolumetricScatteringBlending(0);
  mapper.setLocalAmbientOcclusion(0);
  mapper.setLAOKernelSize(10);
  mapper.setLAOKernelRadius(5);
  mapper.setComputeNormalFromOpacity(true);
  actor.setMapper(mapper);

  const ctfun = vtkColorTransferFunction.newInstance();
  ctfun.addRGBPoint(0, 0, 0, 0);
  ctfun.addRGBPoint(95, 1.0, 1.0, 1.0);
  ctfun.addRGBPoint(225, 0.66, 0.66, 0.5);
  ctfun.addRGBPoint(255, 0.3, 0.3, 0.5);
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(100.0, 0.0);
  ofun.addPoint(255.0, 1.0);
  actor.getProperty().setRGBTransferFunction(0, ctfun);
  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setInterpolationTypeToLinear();
  actor.getProperty().setShade(true);
  actor.getProperty().setAmbient(0.3);
  actor.getProperty().setDiffuse(1);
  actor.getProperty().setSpecular(1);
  actor.setScale(0.003, 0.003, 0.003);
  actor.setPosition(1, 1, -1.1);

  const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });
  await reader.setUrl(`${__BASE_PATH__}/data/volume/LIDC2.vti`);
  await reader.loadData();
  const imageData = reader.getOutputData();

  mapper.setInputData(imageData);

  renderingObjects.forEach(({ renderer, renderWindow }) => {
    renderer.addVolume(actor);
    renderer.resetCamera();
    renderWindow.render();
  });
}

loadVolume();

// ----------------------------------------------------------------------------
// Create Mouse listener for picking on mouse move
// ----------------------------------------------------------------------------

function eventToWindowXY(event, view) {
  // We know we are full screen => window.innerXXX
  // Otherwise we can use pixel device ratio or else...
  const { clientX, clientY } = event;
  const canvas = view.getCanvas();
  const canvasRect = canvas.getBoundingClientRect();
  const normalizedX = (clientX - canvasRect.left) / canvasRect.width;
  const normalizedY = (clientY - canvasRect.top) / canvasRect.height;
  const [width, height] = view.getSize();
  const x = Math.round(width * normalizedX);
  const y = Math.round(height * (1 - normalizedY)); // Need to flip Y
  return [x, y];
}

// ----------------------------------------------------------------------------

let needGlyphCleanup = false;
let lastProcessedActor = null;

const updatePositionTooltip = (worldPosition) => {
  if (lastProcessedActor) {
    positionTooltipElem.innerHTML = `Position: ${worldPosition
      .map((v) => v.toFixed(3))
      .join(' , ')}`;
  } else {
    positionTooltipElem.innerHTML = '';
  }
};

const updateAssociationTooltip = (type, id) => {
  if (type !== undefined && id !== undefined) {
    fieldIdTooltipElem.innerHTML = `${type} ID: ${id}`;
  } else {
    fieldIdTooltipElem.innerHTML = '';
  }
};

const updateCompositeAndPropIdTooltip = (compositeID, propID) => {
  if (compositeID !== undefined) {
    compositeIdTooltipElem.innerHTML = `Composite ID: ${compositeID}`;
  } else {
    compositeIdTooltipElem.innerHTML = '';
  }
  if (propID !== undefined) {
    propIdTooltipElem.innerHTML = `Prop ID: ${propID}`;
  } else {
    propIdTooltipElem.innerHTML = '';
  }
};

const updateCursor = (worldPosition, renderWindow) => {
  if (lastProcessedActor) {
    pointerActor.setVisibility(true);
    pointerActor.setPosition(worldPosition);
  } else {
    pointerActor.setVisibility(false);
  }
  renderWindow.render();
  updatePositionTooltip(worldPosition);
};

function processSelections(selections, renderingObject) {
  renderingObject.renderer
    .getActors()
    .forEach((a) => a.getProperty().setColor(...WHITE));
  if (!selections || selections.length === 0) {
    lastProcessedActor = null;
    updateAssociationTooltip();
    updateCursor(undefined, renderingObject.renderWindow);
    updateCompositeAndPropIdTooltip();
    return;
  }

  const {
    worldPosition: rayHitWorldPosition,
    compositeID,
    prop,
    propID,
    attributeID,
  } = selections[0].getProperties();

  updateCompositeAndPropIdTooltip(compositeID, propID);

  let closestCellPointWorldPosition = [...rayHitWorldPosition];
  if (attributeID || attributeID === 0) {
    const input = prop.getMapper().getInputData();
    if (!input.getCells()) {
      input.buildCells();
    }

    // Get matrices to convert coordinates: (prop coordinates) <-> (world coordinates)
    const glTempMat = mat4.fromValues(...prop.getMatrix());
    mat4.transpose(glTempMat, glTempMat);
    const propToWorld = vtkMatrixBuilder.buildFromDegree().setMatrix(glTempMat);
    mat4.invert(glTempMat, glTempMat);
    const worldToProp = vtkMatrixBuilder.buildFromDegree().setMatrix(glTempMat);
    // Compute the position of the cursor in prop coordinates
    const propPosition = [...rayHitWorldPosition];
    worldToProp.apply(propPosition);

    if (
      renderingObject.hardwareSelector.getFieldAssociation() ===
      FieldAssociations.FIELD_ASSOCIATION_POINTS
    ) {
      // Selecting points
      closestCellPointWorldPosition = [
        ...input.getPoints().getTuple(attributeID),
      ];
      propToWorld.apply(closestCellPointWorldPosition);
      updateAssociationTooltip('Point', attributeID);
    } else {
      // Selecting cells
      const cellPoints = input.getCellPoints(attributeID);
      updateAssociationTooltip('Cell', attributeID);
      if (cellPoints) {
        const pointIds = cellPoints.cellPointIds;
        // Find the closest cell point, and use that as cursor position
        const points = Array.from(pointIds).map((pointId) =>
          input.getPoints().getPoint(pointId)
        );
        const distance = (pA, pB) =>
          vtkMath.distance2BetweenPoints(pA, propPosition) -
          vtkMath.distance2BetweenPoints(pB, propPosition);
        const sorted = points.sort(distance);
        closestCellPointWorldPosition = [...sorted[0]];
        propToWorld.apply(closestCellPointWorldPosition);
      }
    }
  }
  lastProcessedActor = prop;
  // Use closestCellPointWorldPosition or rayHitWorldPosition
  updateCursor(closestCellPointWorldPosition, renderingObject.renderWindow);

  // Make the picked actor green
  prop.getProperty().setColor(...GREEN);

  // We hit the glyph, let's scale the picked glyph
  if (prop === cylinderActor) {
    scaleArray.fill(0.5);
    scaleArray[compositeID] = 0.7;
    cylinderPointSet.modified();
    needGlyphCleanup = true;
  } else if (needGlyphCleanup) {
    needGlyphCleanup = false;
    scaleArray.fill(0.5);
    cylinderPointSet.modified();
  }
  renderingObject.renderWindow.render();
}

// ----------------------------------------------------------------------------

function pickOnMouseEvent(event) {
  const renderingObject = renderingObjects.find(({ view }) =>
    view.getCanvas().matches(':hover')
  );
  if (!renderingObject || renderingObject.interactor.isAnimating()) {
    // We should not do picking when interacting with the scene
    return;
  }

  const [x, y] = eventToWindowXY(event, renderingObject.view);

  pointerActor.setVisibility(false);
  renderingObject.hardwareSelector
    .getSourceDataAsync(renderingObject.renderer, x, y, x, y)
    .then((result) => {
      if (result) {
        processSelections(
          result.generateSelection(x, y, x, y),
          renderingObject
        );
      } else {
        processSelections(null, renderingObject);
      }
    });
}
const throttleMouseHandler = throttle(pickOnMouseEvent, 20);

document.addEventListener('mousemove', throttleMouseHandler);
