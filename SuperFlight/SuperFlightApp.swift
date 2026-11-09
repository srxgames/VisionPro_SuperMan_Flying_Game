import SwiftUI

@main
struct SuperFlightApp: App {
    @State private var appModel = AppModel()
    @State private var immersionStyle: ImmersionStyle = .full

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appModel)
        }
        .windowResizability(.contentSize)

        ImmersiveSpace(id: AppModel.immersiveSpaceID) {
            ImmersiveView()
                .environment(appModel)
        }
        .immersionStyle(selection: $immersionStyle, in: .full)
    }
}
